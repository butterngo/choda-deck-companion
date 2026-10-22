// TASK-2608 — the run's deploy checklist and what is waiting on Butter. Butter,
// 2026-10-21: "những gì cần tôi lưu ý thì phải hiển thị hết lên ... bấm open lên
// rồi copy và chạy thôi chứ không cần phải mở folder a b c". Mockup:
// https://claude.ai/artifact/JZKYzy8jaPDW4821EmZD3o (Deploy checklist, Waiting on you).
//
// Items come from `run.deploy` (TASK-2607); ticks per environment from
// /runs/<goal>/deploy-checks (TASK-2605). A secret's value goes from
// POST /secrets/copy straight to the clipboard inside the click handler and is
// never kept in state or put in the DOM.

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchDeployChecks,
  fetchSecretForClipboard,
  fetchWorkspaceDoc,
  setDeployCheck,
  type DeployChecks,
  type DeployEnv,
  type DeployItem,
  type DeployPhase,
  type RunDeploy,
} from "../api";
import { FullscreenOverlay } from "./FullscreenOverlay";

const PHASES: { id: DeployPhase; label: string }[] = [
  { id: "before", label: "Before deploy" },
  { id: "deploy", label: "Deploy" },
  { id: "after", label: "After deploy" },
];

const ENV_LABEL: Record<DeployEnv, string> = { qc: "QC", prod: "Production" };

const btn =
  "inline-flex items-center gap-1 rounded border border-zinc-200 dark:border-zinc-700 px-2 py-0.5 text-[12px] text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-900 disabled:opacity-50";

const EMPTY: DeployChecks = { qc: {}, prod: {} };

/** The ticks of a goal's checklist, and a tick/untick that refreshes them. */
export function useDeployChecks(goalId: string, enabled: boolean): {
  checks: DeployChecks;
  toggle: (env: DeployEnv, itemKey: string, done: boolean) => void;
} {
  const qc = useQueryClient();
  const key = ["deploy-checks", goalId];
  const q = useQuery({ queryKey: key, queryFn: ({ signal }) => fetchDeployChecks(goalId, signal), enabled });
  return {
    checks: q.data ?? EMPTY,
    toggle: (env, itemKey, done) => {
      void setDeployCheck(goalId, { env, itemKey, done }).then((next) => qc.setQueryData(key, next));
    },
  };
}

/** Items still to do before or by hand on this environment. */
export function waitingItems(items: DeployItem[], checks: DeployChecks, env: DeployEnv): DeployItem[] {
  return items.filter((i) => (i.phase === "before" || i.kind === "manual") && !checks[env][i.key]);
}

function EnvSwitch({ env, onChange }: { env: DeployEnv; onChange: (env: DeployEnv) => void }): React.JSX.Element {
  return (
    <div role="radiogroup" aria-label="Environment" className="inline-flex w-fit rounded-md border border-zinc-200 dark:border-zinc-700 text-[12.5px]">
      {(["qc", "prod"] as DeployEnv[]).map((e) => (
        <button
          key={e}
          type="button"
          role="radio"
          aria-checked={env === e}
          onClick={() => onChange(e)}
          className={`px-3 py-1 ${env === e ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "text-zinc-600 dark:text-zinc-300"}`}
        >
          {ENV_LABEL[e]}
        </button>
      ))}
    </div>
  );
}

/** One-line status after an action. Never carries a secret value. */
function useNote(): [string | null, (text: string) => void] {
  const [note, setNote] = useState<string | null>(null);
  return [note, setNote];
}

function FileDialog({ path, workspaceId, onClose }: { path: string; workspaceId: string; onClose: () => void }): React.JSX.Element {
  const [text, setText] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useNote();
  const pre = useRef<HTMLPreElement | null>(null);
  useEffect(() => {
    const ctrl = new AbortController();
    fetchWorkspaceDoc(workspaceId, path, ctrl.signal).then(
      (doc) => setText(doc.text),
      (e: Error) => {
        if (ctrl.signal.aborted) return;
        if (/\b404\b/.test(e.message)) setMissing(true);
        else setError(e.message);
      },
    );
    return () => ctrl.abort();
  }, [workspaceId, path]);
  function copy(): void {
    if (text === null) return;
    navigator.clipboard.writeText(text).then(
      () => setNote("Copied"),
      () => {
        const node = pre.current;
        const sel = window.getSelection();
        if (node && sel) {
          const range = document.createRange();
          range.selectNodeContents(node);
          sel.removeAllRanges();
          sel.addRange(range);
        }
        setNote("Selected — press Ctrl+C");
      },
    );
  }
  return (
    <FullscreenOverlay title={path} onClose={onClose} testId="deploy-file-dialog">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <button type="button" className={btn} onClick={copy} disabled={text === null}>
            <i className="ti ti-copy" aria-hidden="true" />
            Copy
          </button>
          {note && (
            <span role="status" className="text-xs text-zinc-500">
              {note}
            </span>
          )}
        </div>
        {missing ? (
          <p className="text-[12.5px] text-rose-600">file not found at {path}</p>
        ) : error ? (
          <p className="text-[12.5px] text-rose-600">Couldn't read the file: {error}</p>
        ) : text === null ? (
          <p className="text-[12.5px] text-zinc-400">Loading…</p>
        ) : (
          <pre ref={pre} data-testid="deploy-file-text" className="whitespace-pre-wrap break-words font-mono text-xs">
            {text}
          </pre>
        )}
      </div>
    </FullscreenOverlay>
  );
}

/** Open / Copy / Copy value for one item; shared by both tabs. */
function ItemActions({ item, workspaceId }: { item: DeployItem; workspaceId: string }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useNote();
  const ws = item.workspaceId ?? workspaceId;

  function copyText(text: string, done: string): void {
    navigator.clipboard.writeText(text).then(
      () => setNote(done),
      () => setNote("Copy failed"),
    );
  }

  function copyFile(file: string): void {
    fetchWorkspaceDoc(ws, file).then(
      (doc) => copyText(doc.text, "Copied"),
      () => setNote(`file not found at ${file}`),
    );
  }

  function copyValue(ref: { file: string; field: string }): void {
    // The value lives only inside this promise chain: into the clipboard, then gone.
    fetchSecretForClipboard({ workspaceId: ws, file: ref.file, field: ref.field })
      .then((value) => navigator.clipboard.writeText(value))
      .then(
        () => setNote(`Copied value of ${item.key.replace(/^config:/, "")}`),
        () => setNote("Copy failed"),
      );
  }

  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {item.file && (
        <>
          <button type="button" className={btn} onClick={() => setOpen(true)}>
            <i className="ti ti-file-text" aria-hidden="true" />
            Open
          </button>
          <button type="button" className={btn} onClick={() => copyFile(item.file as string)}>
            <i className="ti ti-copy" aria-hidden="true" />
            Copy
          </button>
        </>
      )}
      {!item.file && item.copy && (
        <button type="button" className={btn} onClick={() => copyText(item.copy as string, "Copied")}>
          <i className="ti ti-copy" aria-hidden="true" />
          Copy
        </button>
      )}
      {item.secret && (
        <button type="button" className={btn} onClick={() => copyValue(item.secret as { file: string; field: string })}>
          <i className="ti ti-key" aria-hidden="true" />
          Copy value
        </button>
      )}
      {note && (
        <span role="status" className="text-[11.5px] text-zinc-500">
          {note}
        </span>
      )}
      {open && item.file && <FileDialog path={item.file} workspaceId={ws} onClose={() => setOpen(false)} />}
    </span>
  );
}

function ItemRow({
  item,
  deploy,
  env,
  checks,
  onToggle,
}: {
  item: DeployItem;
  deploy: RunDeploy;
  env: DeployEnv;
  checks: DeployChecks;
  onToggle: (done: boolean) => void;
}): React.JSX.Element {
  const done = Boolean(checks[env][item.key]);
  const notOnQc = env === "prod" && !checks.qc[item.key];
  return (
    <li data-testid={`deploy-item-${item.key}`} className="flex flex-col gap-1 border-t border-zinc-100 dark:border-zinc-800 py-2 first:border-t-0">
      <div className="flex flex-wrap items-start gap-2">
        <input
          type="checkbox"
          checked={done}
          onChange={(e) => onToggle(e.target.checked)}
          aria-label={`Done on ${ENV_LABEL[env]}: ${item.title}`}
          className="mt-0.5"
        />
        <span className="min-w-0 flex-1">
          <span className="text-[13px] text-zinc-800 dark:text-zinc-100">{item.title}</span>
          {notOnQc && (
            <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
              not done on QC
            </span>
          )}
          <span className="block text-[12px] text-zinc-500">{item.why}</span>
          {item.file && <span className="block break-all font-mono text-[11.5px] text-zinc-400">{item.file}</span>}
        </span>
        <ItemActions item={item} workspaceId={deploy.workspaceId} />
      </div>
    </li>
  );
}

export function DeployChecklistTab({
  deploy,
  env,
  onEnv,
  checks,
  onToggle,
}: {
  deploy: RunDeploy;
  env: DeployEnv;
  onEnv: (env: DeployEnv) => void;
  checks: DeployChecks;
  onToggle: (env: DeployEnv, itemKey: string, done: boolean) => void;
}): React.JSX.Element {
  if (deploy.items === null) return <p className="text-[12.5px] text-zinc-500">Checklist unreadable ({deploy.path})</p>;
  const items = deploy.items;
  return (
    <>
      <EnvSwitch env={env} onChange={onEnv} />
      {items.length === 0 && <p className="text-[12.5px] text-zinc-400">Nothing to deploy</p>}
      {PHASES.map((p) => {
        const rows = items.filter((i) => i.phase === p.id);
        if (rows.length === 0) return null;
        return (
          <section key={p.id} aria-label={p.label} className="flex flex-col">
            <h4 className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">{p.label}</h4>
            <ul>
              {rows.map((i) => (
                <ItemRow
                  key={i.key}
                  item={i}
                  deploy={deploy}
                  env={env}
                  checks={checks}
                  onToggle={(done) => onToggle(env, i.key, done)}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}

export function WaitingOnYouTab({
  deploy,
  env,
  onEnv,
  checks,
  humanOpen,
}: {
  deploy: RunDeploy;
  env: DeployEnv;
  onEnv: (env: DeployEnv) => void;
  checks: DeployChecks;
  humanOpen: string[];
}): React.JSX.Element {
  const items = waitingItems(deploy.items ?? [], checks, env);
  return (
    <>
      <EnvSwitch env={env} onChange={onEnv} />
      {items.length === 0 && humanOpen.length === 0 && <p className="text-[12.5px] text-zinc-400">Nothing waiting on you</p>}
      <ul>
        {items.map((i) => (
          <li key={i.key} data-testid={`waiting-${i.key}`} className="flex flex-wrap items-start gap-2 border-t border-zinc-100 dark:border-zinc-800 py-2 first:border-t-0">
            <span className="min-w-0 flex-1">
              <span className="text-[13px]">{i.title}</span>
              <span className="block text-[12px] text-zinc-500">{i.why}</span>
            </span>
            <ItemActions item={i} workspaceId={deploy.workspaceId} />
          </li>
        ))}
        {humanOpen.map((h) => (
          <li key={h} className="border-t border-zinc-100 dark:border-zinc-800 py-2 text-[13px] first:border-t-0">
            {h}
          </li>
        ))}
      </ul>
    </>
  );
}
