// TASK-2532 — "Runs": what each /choda-autopilot or /choda-burn-backlog run
// finished, what it tested and what it left for Butter, grouped by project.
// Butter, 2026-10-19: "làm sao để biết được xong task nào, đã test những gì,
// còn gì". Agreed mockup: https://claude.ai/artifact/XG9UJ3bPmQERJaaZTaf8uM
//
// The decide screen shows a run's notices and forgets them on dismiss; this
// screen joins them with the goal's items, commits, criteria and test lines
// (GET /runs). The dependency flow per run is RunFlow (TASK-2538).
//
// TASK-2563 — an item row expands in place to its test lines, the test cases
// its commits added, and each commit's files and diff (Butter, 2026-10-20:
// "chưa thể hiện được cái test", "thấy được commit và code change"). Mockup:
// https://claude.ai/artifact/MZcAdez2hWLewKveSrBhsS. The task page, where the
// translate button is, is one link inside the expansion.

import { useRef, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { useQueries } from "@tanstack/react-query";
import { fetchWorkspaceCommit, fetchWorkspaceDoc } from "../api";
import type {
  Run,
  RunAc,
  RunAcState,
  RunCommit,
  RunCoverage,
  RunFeature,
  RunItem,
  DeployEnv,
  RunNotice,
  RunReport,
  RunSequence,
  RunSmoke,
  RunStage,
  RunState,
  WorkspaceCommitDetail,
} from "../api";
import { MermaidBlock } from "../components/MermaidBlock";
import { addedTestCases, parseSuiteLine } from "../lib/run-tests";
import { FileDiff } from "../components/FileDiff";
import type { HealthView } from "../hooks/use-health";
import { useRuns } from "../hooks/use-runs";
import { ErrorState } from "../components/state/ErrorState";
import { EmptyState } from "../components/state/EmptyState";
import { Skeleton } from "../components/state/Skeleton";
import { RunFlow } from "../components/RunFlow";
import { FullscreenOverlay } from "../components/FullscreenOverlay";
import {
  DeployChecklistTab,
  WaitingOnYouTab,
  useDeployChecks,
  waitingItems,
} from "../components/DeployChecklist";

type Filter = "all" | "running" | "finished" | "halted";

const STATE_PILL: Record<RunState, { label: string; icon: string; cls: string }> = {
  running: { label: "Running", icon: "ti-loader-2", cls: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" },
  finished: { label: "Finished", icon: "ti-circle-check", cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" },
  halted: { label: "Halted", icon: "ti-alert-triangle", cls: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300" },
  "waiting-merge": { label: "Waiting for merge", icon: "ti-git-pull-request", cls: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" },
  idle: { label: "Idle", icon: "ti-player-pause", cls: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300" },
};

const STAGES: { id: RunStage; label: string }[] = [
  { id: "started", label: "Started" },
  { id: "working", label: "Working" },
  { id: "pr-opened", label: "PR opened" },
  { id: "merged", label: "Merged" },
  { id: "done", label: "Done" },
];

const DONE_STATUSES = ["IMPLEMENTED", "DONE"];
const isDone = (i: RunItem): boolean => DONE_STATUSES.includes(i.status);

function hhmm(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : `${d.toLocaleDateString([], { day: "2-digit", month: "short" })} ${hhmm(iso)}`;
}

/** Which bucket a filter chip puts a run in. Waiting for merge and idle count as running work. */
function bucket(state: RunState): Exclude<Filter, "all"> {
  if (state === "finished") return "finished";
  if (state === "halted") return "halted";
  return "running";
}

function Stepper({ run }: { run: Run }): React.JSX.Element {
  const done = run.items.filter(isDone).length;
  const at = STAGES.findIndex((s) => s.id === run.stage);
  return (
    <ol aria-label="Run stage" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      {STAGES.map((s, k) => {
        const state =
          run.failedAt === s.id
            ? "failed"
            : k < at || (run.stage === "done" && k === at)
              ? "done"
              : k === at
                ? "current"
                : "todo";
        const cls = {
          done: "text-zinc-600 dark:text-zinc-300",
          current: "text-blue-700 dark:text-blue-300 font-medium",
          failed: "text-rose-700 dark:text-rose-400 font-medium",
          todo: "text-zinc-400",
        }[state];
        const icon = { done: "ti-circle-check", current: "ti-loader-2", failed: "ti-circle-x", todo: "ti-circle-dashed" }[state];
        return (
          <li key={s.id} data-step={s.id} data-state={state} className={`flex items-center gap-1 ${cls}`}>
            {k > 0 && <span aria-hidden="true" className="mr-1 h-px w-4 bg-zinc-300 dark:bg-zinc-700" />}
            <i className={`ti ${icon}`} aria-hidden="true" />
            {s.label}
            {s.id === "working" && run.items.length > 0 && (
              <span className="text-zinc-400 font-normal">
                {done}/{run.items.length}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * TASK-2563 — the table's Tests cell. The suite total is shown only when the
 * first line has the fixed shape the loops write (TASK-2561); any other first
 * line is shown as written, with a count of the lines behind it.
 */
function TestsSummary({ tests }: { tests: RunItem["tests"] }): React.JSX.Element | null {
  const first = tests?.passed[0];
  if (first === undefined) return null;
  const suite = parseSuiteLine(first);
  if (suite) {
    return (
      <span>
        {suite.passed} passed
        {suite.failed > 0 && <span className="text-rose-700 dark:text-rose-400"> · {suite.failed} failed</span>}
      </span>
    );
  }
  const more = (tests?.passed.length ?? 1) - 1;
  return (
    <span>
      {first}
      {more > 0 && <span className="text-zinc-400"> +{more} more</span>}
    </span>
  );
}

/**
 * The item's commits. An adapter older than TASK-2560 serves only `commit`,
 * with no repo, so that one commit is kept and marked as unreadable rather
 * than dropped.
 */
function itemCommits(item: RunItem): RunCommit[] {
  if (item.commits) return item.commits;
  if (!item.commit) return [];
  const space = item.commit.indexOf(" ");
  return [
    {
      sha: space === -1 ? item.commit : item.commit.slice(0, space),
      subject: space === -1 ? "" : item.commit.slice(space + 1),
      workspaceId: null,
      sessionId: "",
    },
  ];
}

function SectionLabel({ children, count }: { children: React.ReactNode; count?: number }): React.JSX.Element {
  return (
    <h5 className="flex items-baseline gap-2 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
      {children}
      {count !== undefined && <span data-testid="count" className="tabular-nums normal-case">{count}</span>}
    </h5>
  );
}

function CommitEntry({
  commit,
  detail,
}: {
  commit: RunCommit;
  detail: { data?: WorkspaceCommitDetail; isLoading: boolean; isError: boolean };
}): React.JSX.Element {
  const [openFile, setOpenFile] = useState<string | null>(null);
  const short = commit.sha.slice(0, 7);

  if (commit.workspaceId === null || detail.isError) {
    return (
      <div className="flex flex-col gap-0.5 px-3 py-2 text-[12.5px]">
        <span className="font-mono text-xs text-zinc-500">{short}</span>
        <span className="text-zinc-500">Commit not readable on this machine</span>
      </div>
    );
  }
  if (detail.isLoading || !detail.data) {
    return (
      <div className="px-3 py-2">
        <span className="font-mono text-xs text-zinc-500">{short}</span>
        <Skeleton shape="list" label="Loading commit…" />
      </div>
    );
  }

  const c = detail.data;
  const plus = c.files.reduce((n, f) => n + (f.insertions ?? 0), 0);
  const minus = c.files.reduce((n, f) => n + (f.deletions ?? 0), 0);
  const selected = c.files.find((f) => f.path === openFile) ?? null;
  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-0.5 px-3 py-2">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="font-mono text-xs text-zinc-500">{c.shortSha || short}</span>
          <span className="min-w-0">{c.subject}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 text-xs text-zinc-400">
          <span>
            {c.files.length} file{c.files.length === 1 ? "" : "s"} ·{" "}
            <span className="text-emerald-600 dark:text-emerald-400">+{plus}</span>{" "}
            <span className="text-rose-600 dark:text-rose-400">−{minus}</span>
          </span>
          {c.webUrl && (
            <a href={c.webUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
              <i className="ti ti-external-link" aria-hidden="true" />
              View on GitHub
            </a>
          )}
        </div>
      </div>
      <ul className="border-t border-zinc-100 dark:border-zinc-800">
        {c.files.map((f) => (
          <li key={f.path}>
            <button
              type="button"
              data-testid={`run-file-${f.path}`}
              aria-pressed={openFile === f.path}
              onClick={() => setOpenFile((p) => (p === f.path ? null : f.path))}
              className={`flex w-full items-center gap-2 px-3 py-1 text-left font-mono text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800/50 ${
                openFile === f.path ? "bg-zinc-100 dark:bg-zinc-800" : ""
              }`}
            >
              <span className="min-w-0 flex-1 truncate">{f.path}</span>
              {f.binary ? (
                <span className="text-[11px] text-zinc-400">binary</span>
              ) : (
                <span className="tabular-nums">
                  <span className="text-emerald-600 dark:text-emerald-400">+{f.insertions}</span>{" "}
                  <span className="text-rose-600 dark:text-rose-400">−{f.deletions}</span>
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
      {selected && (
        <div className="max-h-96 overflow-y-auto border-t border-zinc-200 dark:border-zinc-800 p-2">
          <FileDiff file={selected} onOpen={setOpenFile} />
        </div>
      )}
    </div>
  );
}

/**
 * TASK-2563 — the expansion under an item row: what was tested, what the
 * commits added as tests, and what they changed. Commits load only while the
 * row is open, through the same query key as useWorkspaceCommit, so a commit
 * read here is not read again on the workspace page.
 */
const AC_STATE: Record<RunAcState, string> = {
  covered: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  weak: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  open: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
  human: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
};

const METHOD_LABEL: Record<string, string> = { test: "Test", command: "Command", grep: "Grep", manual: "Manual" };

/** TASK-2598 — the item's diagram, drawn; its source one click away. */
function SequencePanel({ sequence }: { sequence: RunSequence | undefined }): React.JSX.Element {
  if (sequence && "mermaid" in sequence) {
    return (
      <div className="flex flex-col gap-2">
        <MermaidBlock code={sequence.mermaid} />
        <details className="text-xs text-zinc-500">
          <summary className="cursor-pointer">Source</summary>
          <pre className="mt-1 overflow-x-auto rounded bg-zinc-100 dark:bg-zinc-900 p-2 font-mono">{sequence.mermaid}</pre>
        </details>
      </div>
    );
  }
  return (
    <p className="text-[12.5px] text-zinc-400">
      {sequence && "na" in sequence ? `No diagram — ${sequence.na}` : "No diagram"}
    </p>
  );
}

/** TASK-2598 — every criterion beside what proved it (TASK-2597's rows). */
function TestCasesPanel({ acs, coverage }: { acs: RunAc[]; coverage: RunCoverage | undefined }): React.JSX.Element {
  return (
    <section aria-label="Test cases" className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <SectionLabel>Test cases</SectionLabel>
        {coverage && (
          <span data-testid="run-coverage" className="tabular-nums text-xs text-zinc-500">
            {coverage.covered}/{coverage.total} covered
          </span>
        )}
      </div>
      {acs.length === 0 ? (
        <p className="text-[12.5px] text-zinc-400">No acceptance criteria</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-zinc-400">
                <th className="px-2 py-1 font-normal">#</th>
                <th className="px-2 py-1 font-normal">Criterion</th>
                <th className="px-2 py-1 font-normal">Expected</th>
                <th className="px-2 py-1 font-normal">Proven by</th>
                <th className="px-2 py-1 font-normal">Test / command</th>
                <th className="px-2 py-1 font-normal">State</th>
              </tr>
            </thead>
            <tbody>
              {acs.map((a) => (
                <tr key={a.index} data-testid={`run-ac-${a.index}`} className="border-t border-zinc-100 dark:border-zinc-800 align-top">
                  <td className="px-2 py-1 tabular-nums text-zinc-400">{a.index}</td>
                  <td className="px-2 py-1 min-w-[16rem]">{a.text}</td>
                  <td className="px-2 py-1 whitespace-nowrap text-zinc-500">{a.tag ?? "—"}</td>
                  <td className="px-2 py-1 whitespace-nowrap text-zinc-500">{a.method ? (METHOD_LABEL[a.method] ?? a.method) : "—"}</td>
                  <td className="px-2 py-1 min-w-[12rem] break-all font-mono text-xs text-zinc-600 dark:text-zinc-300">{a.ref ?? "—"}</td>
                  <td className="px-2 py-1">
                    <span data-testid="run-ac-state" className={`rounded px-1.5 py-0.5 text-[11px] ${AC_STATE[a.state]}`}>
                      {a.state}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

type ItemTab = "sequence" | "test-cases" | "commits";

const ITEM_TABS: { id: ItemTab; label: string }[] = [
  { id: "sequence", label: "Sequence" },
  { id: "test-cases", label: "Test cases" },
  { id: "commits", label: "Commits & diff" },
];

function TaskLink({ id }: { id: string }): React.JSX.Element {
  return (
    <Link
      to={`/tasks/${encodeURIComponent(id)}`}
      state={{ from: { to: "/runs", label: "Runs" } }}
      className="inline-flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-300 underline"
    >
      <i className="ti ti-clipboard-check" aria-hidden="true" />
      Open task
    </Link>
  );
}

/**
 * TASK-2598 — with the adapter's criteria (TASK-2597) the expansion gains
 * sub-tabs, Test cases first: what was proven is the question Butter asks of an
 * item. Without them (an older vendored adapter) it stays as TASK-2563 drew it.
 */
function ItemDetail({ item }: { item: RunItem }): React.JSX.Element {
  const [tab, setTab] = useState<ItemTab>("test-cases");
  if (!item.acs) return <CommitsAndDiff item={item} testId={`run-item-detail-${item.id}`} withTaskLink />;
  return (
    <div data-testid={`run-item-detail-${item.id}`} className="flex flex-col">
      <div role="tablist" aria-label="Item views" className="flex gap-1 border-b border-zinc-200 dark:border-zinc-800 px-3">
        {ITEM_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={t.id === tab}
            onClick={() => setTab(t.id)}
            className={`whitespace-nowrap border-b-2 px-2.5 py-1.5 text-[12.5px] ${
              t.id === tab
                ? "border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100 font-medium"
                : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" aria-label={ITEM_TABS.find((t) => t.id === tab)?.label}>
        {tab === "sequence" && (
          <div className="px-3 py-3">
            <SequencePanel sequence={item.sequence} />
          </div>
        )}
        {tab === "test-cases" && (
          <div className="px-3 py-3">
            <TestCasesPanel acs={item.acs} coverage={item.coverage} />
          </div>
        )}
        {tab === "commits" && <CommitsAndDiff item={item} />}
      </div>
      <div className="px-3 pb-3">
        <TaskLink id={item.id} />
      </div>
    </div>
  );
}

function CommitsAndDiff({
  item,
  testId,
  withTaskLink = false,
}: {
  item: RunItem;
  testId?: string;
  withTaskLink?: boolean;
}): React.JSX.Element {
  const commits = itemCommits(item);
  const details = useQueries({
    queries: commits.map((c) => ({
      queryKey: ["workspace-commit", c.workspaceId, c.sha],
      queryFn: ({ signal }: { signal: AbortSignal }) => fetchWorkspaceCommit(c.workspaceId as string, c.sha, signal),
      enabled: c.workspaceId !== null,
      staleTime: Infinity,
      retry: false,
    })),
  });
  const loaded = details.flatMap((d) => (d.data ? [d.data] : []));
  const loading = details.some((d) => d.isLoading);
  const added = addedTestCases(loaded.flatMap((d) => d.files));
  const byPath = new Map<string, string[]>();
  for (const t of added) byPath.set(t.path, [...(byPath.get(t.path) ?? []), t.name]);

  return (
    <div data-testid={testId} className="grid gap-3 px-3 py-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
      <section aria-label="Tests" className="flex min-w-0 flex-col gap-3 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-3">
        <div className="flex flex-col gap-1">
          <SectionLabel>Ran</SectionLabel>
          {item.tests && (item.tests.passed.length > 0 || item.tests.skipped.length > 0) ? (
            <ul className="flex flex-col gap-0.5 text-[12.5px]">
              {item.tests.passed.map((l) => (
                <li key={`p-${l}`} className="flex gap-1.5">
                  <i className="ti ti-check text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                  <span>{l}</span>
                </li>
              ))}
              {item.tests.skipped.map((l) => (
                <li key={`s-${l}`} className="flex gap-1.5 text-zinc-500">
                  <i className="ti ti-minus text-amber-600 dark:text-amber-400" aria-hidden="true" />
                  <span>Skipped: {l}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12.5px] text-zinc-400">No test results recorded</p>
          )}
        </div>
        <section aria-label="Test cases added" className="flex flex-col gap-1">
          <SectionLabel count={loading ? undefined : added.length}>Test cases added</SectionLabel>
          {loading ? (
            <Skeleton shape="list" label="Reading the diff…" />
          ) : commits.length === 0 ? (
            <p className="text-[12.5px] text-zinc-400">No commit recorded</p>
          ) : loaded.length === 0 ? (
            <p className="text-[12.5px] text-zinc-400">Unavailable — no commit could be read on this machine</p>
          ) : (
            [...byPath].map(([path, names]) => (
              <div key={path} className="flex flex-col gap-0.5">
                <span className="font-mono text-xs text-zinc-600 dark:text-zinc-300">{path}</span>
                <ul className="flex flex-col gap-0.5 text-[12.5px] text-zinc-600 dark:text-zinc-300">
                  {names.map((n, k) => (
                    <li key={`${n}-${k}`} className="flex gap-1.5">
                      <i className="ti ti-check text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                      <span>{n}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </section>
      </section>

      <section aria-label="Commits" className="flex min-w-0 flex-col rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
        <div className="border-b border-zinc-200 dark:border-zinc-800 px-3 py-2">
          <SectionLabel count={commits.length}>Commits</SectionLabel>
        </div>
        {commits.length === 0 ? (
          <p className="px-3 py-2 text-[12.5px] text-zinc-400">No commit recorded</p>
        ) : (
          commits.map((c, k) => (
            <div key={c.sha} className={k > 0 ? "border-t border-zinc-200 dark:border-zinc-800" : ""}>
              <CommitEntry
                commit={c}
                detail={{ data: details[k]?.data, isLoading: details[k]?.isLoading ?? false, isError: details[k]?.isError ?? false }}
              />
            </div>
          ))
        )}
      </section>

      {withTaskLink && (
        <div className="md:col-span-2">
          <TaskLink id={item.id} />
        </div>
      )}
    </div>
  );
}

function ItemRow({
  item,
  open,
  onToggle,
}: {
  item: RunItem;
  open: boolean;
  onToggle: () => void;
}): React.JSX.Element {
  const status = item.activeSince ? "In progress" : isDone(item) ? "Implemented" : item.status === "TODO" || item.status === "READY" ? "Waiting" : item.status;
  return (
    <>
      <tr
        data-testid={`run-item-${item.id}`}
        tabIndex={0}
        aria-expanded={open}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter") onToggle();
        }}
        className={`cursor-pointer border-t border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 align-top ${
          open ? "bg-zinc-50 dark:bg-zinc-800/50" : ""
        }`}
      >
        <td className="px-3 py-1.5 whitespace-nowrap text-zinc-600 dark:text-zinc-300">
          <i className={`ti ti-chevron-right mr-1 text-zinc-400 transition-transform ${open ? "rotate-90" : ""}`} aria-hidden="true" />
          {status}
        </td>
        <td className="px-3 py-1.5 whitespace-nowrap font-mono text-xs text-zinc-500">{item.id}</td>
        <td className="px-3 py-1.5 min-w-[14rem]">{item.title}</td>
        <td data-col="commit" className="px-3 py-1.5 whitespace-nowrap font-mono text-xs text-zinc-500">
          {item.commit ? item.commit.split(" ")[0] : "—"}
        </td>
        {item.coverage ? (
          <td
            data-col="ac"
            className={`px-3 py-1.5 whitespace-nowrap tabular-nums ${
              item.coverage.open > 0 ? "text-rose-700 dark:text-rose-400" : ""
            }`}
            title="Criteria proven by a check their tag allows"
          >
            {item.coverage.covered}/{item.coverage.total}
          </td>
        ) : (
          <td data-col="ac" className="px-3 py-1.5 whitespace-nowrap tabular-nums">
            {item.ac.ticked}/{item.ac.total}
          </td>
        )}
        <td className="px-3 py-1.5 min-w-[12rem] text-zinc-600 dark:text-zinc-300">
          {item.activeSince ? (
            <span className="text-blue-700 dark:text-blue-300">working since {hhmm(item.activeSince)}</span>
          ) : (
            <TestsSummary tests={item.tests} />
          )}
          {item.tests?.skipped.map((s) => (
            <span key={s} className="block text-[11.5px] text-zinc-400">
              skipped: {s}
            </span>
          ))}
        </td>
      </tr>
      {open && (
        <tr className="bg-zinc-50 dark:bg-zinc-900/60">
          <td colSpan={6} className="p-0">
            <ItemDetail item={item} />
          </td>
        </tr>
      )}
    </>
  );
}

function Timeline({ notices }: { notices: RunNotice[] }): React.JSX.Element {
  return (
    <details className="text-[12.5px]">
      <summary className="cursor-pointer text-zinc-500">
        Timeline · {notices.length} notice{notices.length === 1 ? "" : "s"}, kept after dismiss
      </summary>
      <ol className="mt-1.5 flex flex-col gap-1 border-l border-zinc-200 dark:border-zinc-800 pl-3">
        {notices.map((n) => (
          <li key={n.id} className="flex flex-wrap gap-x-3">
            <time className="font-mono text-[11.5px] text-zinc-400">{when(n.createdAt)}</time>
            <span className="min-w-0 flex-1">{n.title}</span>
            {n.status === "archived" && <span className="text-[11px] text-zinc-400">dismissed</span>}
          </li>
        ))}
      </ol>
    </details>
  );
}

function RunCard({ run }: { run: Run }): React.JSX.Element {
  const [open, setOpen] = useState(run.state === "running");
  // TASK-2563 — one item open at a time per run.
  const [openItem, setOpenItem] = useState<string | null>(null);
  const pill = STATE_PILL[run.state];
  const done = run.items.filter(isDone).length;
  const human = run.items.flatMap((i) => i.ac.humanOpen.map((c) => `${i.id} · ${c}`));
  // TASK-2608 — one environment choice and one set of ticks for both deploy tabs.
  const [env, setEnv] = useState<DeployEnv>("qc");
  const deploy = useDeployChecks(run.goal.id, Boolean(run.deploy));
  return (
    <article
      data-testid={`run-${run.goal.id}`}
      data-state={run.state}
      className="rounded-md border border-zinc-200 dark:border-zinc-800"
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full flex-wrap items-center gap-2 px-3 py-2.5 text-left"
      >
        <i className={`ti ti-chevron-right text-zinc-400 transition-transform ${open ? "rotate-90" : ""}`} aria-hidden="true" />
        <span className="font-mono text-xs text-zinc-500">{run.goal.id}</span>
        <span className="min-w-0 font-medium">{run.goal.title}</span>
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${pill.cls}`}>
          <i className={`ti ${pill.icon}`} aria-hidden="true" />
          {pill.label}
        </span>
        <span className="ml-auto text-xs text-zinc-400">{when(run.lastActivityAt)}</span>
        <FeatureLine feature={run.feature} />
      </button>
      {open && (
        <RunTabs
          runId={run.goal.id}
          tabs={[
            {
              id: "overview",
              label: "Overview",
              content: (
                <>
                  {run.feature && !run.feature.missing && <FeatureCard feature={run.feature} />}
                  <Stepper run={run} />
                  <MetaLine run={run} done={done} />
                </>
              ),
            },
            {
              id: "items",
              label: "Items",
              content: (
                <>
          {/* TASK-2538 — the dependency flow, above the table it summarises. */}
          <RunFlow items={run.items} />
          {run.items.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-[11px] font-medium uppercase tracking-wide text-zinc-400">
                    <th className="px-3 py-1">Status</th>
                    <th className="px-3 py-1">Task</th>
                    <th className="px-3 py-1">Title</th>
                    <th className="px-3 py-1">Commit</th>
                    <th className="px-3 py-1">AC</th>
                    <th className="px-3 py-1">Tests</th>
                  </tr>
                </thead>
                <tbody>
                  {run.items.map((i) => (
                    <ItemRow
                      key={i.id}
                      item={i}
                      open={openItem === i.id}
                      onToggle={() => setOpenItem((cur) => (cur === i.id ? null : i.id))}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <section aria-label="Waiting on you" className="text-[12.5px]">
            <h4 className="mb-1 text-xs font-medium text-zinc-600 dark:text-zinc-300">Waiting on you</h4>
            {human.length > 0 ? (
              <ul className="list-disc pl-5 text-zinc-600 dark:text-zinc-300">
                {human.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            ) : (
              <p className="text-zinc-400">Nothing</p>
            )}
          </section>
          <Timeline notices={run.notices} />
                </>
              ),
            },
            ...(run.report
              ? [{ id: "test-report", label: "Test report", content: <TestReportTab report={run.report} /> }]
              : []),
            ...(run.deploy
              ? [
                  {
                    id: "deploy",
                    label: "Deploy checklist",
                    content: (
                      <DeployChecklistTab
                        deploy={run.deploy}
                        env={env}
                        onEnv={setEnv}
                        checks={deploy.checks}
                        onToggle={deploy.toggle}
                      />
                    ),
                  },
                  {
                    id: "waiting",
                    label: `Waiting on you (${waitingItems(run.deploy.items ?? [], deploy.checks, env).length + human.length})`,
                    content: (
                      <WaitingOnYouTab
                        deploy={run.deploy}
                        env={env}
                        onEnv={setEnv}
                        checks={deploy.checks}
                        humanOpen={human}
                      />
                    ),
                  },
                ]
              : []),
          ]}
        />
      )}
    </article>
  );
}

function Tile({ label, testId, children }: { label: string; testId: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div data-testid={testId} className="flex flex-col gap-0.5 rounded-md border border-zinc-200 dark:border-zinc-800 px-3 py-2">
      <span className="text-[11px] uppercase tracking-wide text-zinc-400">{label}</span>
      <div className="text-[13px] text-zinc-700 dark:text-zinc-200">{children}</div>
    </div>
  );
}

function SmokeTile({ smoke }: { smoke: RunSmoke | null }): React.JSX.Element {
  if (smoke === null) return <span className="text-zinc-400">not run</span>;
  if ("na" in smoke) return <span className="text-zinc-500">n/a — {smoke.na}</span>;
  const passed = smoke.checks.filter((c) => c.ok).length;
  const failed = passed < smoke.checks.length;
  return (
    <span>
      <span className={`text-lg font-medium tabular-nums ${failed ? "text-rose-600 dark:text-rose-400" : ""}`}>
        {passed}/{smoke.checks.length}
      </span>{" "}
      <span className="text-xs text-zinc-500">on {smoke.env}</span>
    </span>
  );
}

function SmokeTable({ smoke }: { smoke: Extract<RunSmoke, { checks: unknown }> }): React.JSX.Element {
  // Failed checks first: they are why anyone opens this table.
  const rows = [...smoke.checks].sort((a, b) => Number(a.ok) - Number(b.ok));
  return (
    <section aria-label="Smoke" className="flex flex-col gap-2">
      <SectionLabel count={smoke.checks.length}>Smoke</SectionLabel>
      <p className="text-xs text-zinc-500 break-all">
        {smoke.base} · build {smoke.build} · {when(smoke.ranAt)}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-zinc-400">
              <th className="px-2 py-1 font-normal">Check</th>
              <th className="px-2 py-1 font-normal">Call</th>
              <th className="px-2 py-1 font-normal">Expect</th>
              <th className="px-2 py-1 font-normal">Got</th>
              <th className="px-2 py-1 font-normal">Result</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c, i) => (
              <tr key={`${c.name}-${i}`} data-testid="smoke-row" className="border-t border-zinc-100 dark:border-zinc-800 align-top">
                <td className="px-2 py-1">{c.name}</td>
                <td className="px-2 py-1 break-all font-mono text-xs">{c.call}</td>
                <td className="px-2 py-1 text-zinc-500">{c.expect}</td>
                <td className="px-2 py-1 text-zinc-500">{c.got}</td>
                <td className="px-2 py-1">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[11px] ${
                      c.ok
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                        : "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                    }`}
                  >
                    {c.ok ? "pass" : "fail"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {smoke.data.length > 0 && (
        <p className="text-xs text-zinc-500">
          Test data created:{" "}
          <span className="font-mono">{smoke.data.map((d) => (typeof d === "string" ? d : JSON.stringify(d))).join(", ")}</span>
        </p>
      )}
    </section>
  );
}

/**
 * TASK-2602 — "Open full report": the file text in a full-window reader with a
 * Copy button. The file is fetched once, on the first click.
 */
function FullReport({ report }: { report: RunReport }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copyNote, setCopyNote] = useState<string | null>(null);
  const pre = useRef<HTMLPreElement | null>(null);

  async function openReport(): Promise<void> {
    setOpen(true);
    if (text !== null) return;
    try {
      setText((await fetchWorkspaceDoc(report.workspaceId, report.path)).text);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function copy(): void {
    if (text === null) return;
    // writeText is called inside the click handler: the clipboard needs the user gesture.
    navigator.clipboard.writeText(text).then(
      () => setCopyNote("Copied"),
      () => {
        // A denied clipboard must not look like a copy. Select the text so Ctrl+C works.
        const node = pre.current;
        const selection = window.getSelection();
        if (node && selection) {
          const range = document.createRange();
          range.selectNodeContents(node);
          selection.removeAllRanges();
          selection.addRange(range);
        }
        setCopyNote("Selected — press Ctrl+C");
      },
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void openReport()}
        className="inline-flex w-fit items-center gap-1.5 rounded border border-zinc-200 dark:border-zinc-700 px-2.5 py-1 text-[12.5px] text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-900"
      >
        <i className="ti ti-file-text" aria-hidden="true" />
        Open full report
      </button>
      {open && (
        <FullscreenOverlay title={report.path} onClose={() => setOpen(false)} testId="run-report-dialog">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={copy}
                disabled={text === null}
                className="inline-flex items-center gap-1.5 rounded border border-zinc-200 dark:border-zinc-700 px-2.5 py-1 text-[12.5px] disabled:opacity-50"
              >
                <i className="ti ti-copy" aria-hidden="true" />
                Copy
              </button>
              {copyNote && (
                <span role="status" className="text-xs text-zinc-500">
                  {copyNote}
                </span>
              )}
            </div>
            {error ? (
              <p className="text-[12.5px] text-rose-600">Couldn't read the report: {error}</p>
            ) : text === null ? (
              <p className="text-[12.5px] text-zinc-400">Loading…</p>
            ) : (
              <pre ref={pre} data-testid="run-report-text" className="whitespace-pre-wrap break-words font-mono text-xs">
                {text}
              </pre>
            )}
          </div>
        </FullscreenOverlay>
      )}
    </>
  );
}

/** TASK-2602 — the run's test report (TASK-2600 writes it, TASK-2601 serves it). */
function TestReportTab({ report }: { report: RunReport }): React.JSX.Element {
  const s = report.summary;
  if (s === null) {
    return (
      <>
        <p className="text-[12.5px] text-zinc-500">Report unreadable</p>
        <FullReport report={report} />
      </>
    );
  }
  return (
    <>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Tile label="Unit + integration" testId="report-tile-suite">
          {s.suite ? (
            <span>
              <span className="text-lg font-medium tabular-nums">{s.suite.passed}</span>{" "}
              <span className="text-xs text-zinc-500">
                passed · {s.suite.skipped} skipped · {s.suite.failed} failed
              </span>
            </span>
          ) : (
            <span className="text-zinc-400">no suite line</span>
          )}
        </Tile>
        <Tile label="Added by this run" testId="report-tile-added">
          <span className="text-lg font-medium tabular-nums">{s.testsAdded}</span>{" "}
          <span className="text-xs text-zinc-500">test cases</span>
          {s.unreadableCommits.length > 0 && (
            <span className="block text-xs text-amber-600">{s.unreadableCommits.length} commits unreadable here</span>
          )}
        </Tile>
        <Tile label="AC covered" testId="report-tile-ac">
          <span className="text-lg font-medium tabular-nums">
            {s.ac.covered}/{s.ac.total}
          </span>{" "}
          <span className="text-xs text-zinc-500">
            {s.ac.weak} weak · {s.ac.open} open
          </span>
        </Tile>
        <Tile label="Smoke" testId="report-tile-smoke">
          <SmokeTile smoke={s.smoke} />
        </Tile>
      </div>
      {s.smoke && "checks" in s.smoke && <SmokeTable smoke={s.smoke} />}
      <section aria-label="Regression" className="flex flex-col gap-1">
        <SectionLabel count={s.regression.length}>Regression scope</SectionLabel>
        {s.regression.length === 0 ? (
          <p className="text-[12.5px] text-zinc-400">No other finished task realizes this feature</p>
        ) : (
          <ul className="text-[12.5px]">
            {s.regression.map((r) => (
              <li key={r.task} className="flex gap-2">
                <TaskLink id={r.task} />
                <span className="text-zinc-600 dark:text-zinc-300">{r.title}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <FullReport report={report} />
    </>
  );
}

/**
 * TASK-2592 — the run's tabs. Later goals add tabs (Test report, Deploy
 * checklist, Waiting on you) by passing more entries, so the shell owns only
 * the selection, not what a tab holds. Only the selected panel is mounted.
 */
export interface RunTab {
  id: string;
  label: string;
  content: React.ReactNode;
}

function RunTabs({ runId, tabs }: { runId: string; tabs: RunTab[] }): React.JSX.Element {
  const [selected, setSelected] = useState(tabs[0]?.id ?? "");
  const current = tabs.find((t) => t.id === selected) ?? tabs[0];
  return (
    <div className="border-t border-zinc-200 dark:border-zinc-800">
      <div role="tablist" aria-label="Run views" className="flex gap-1 overflow-x-auto border-b border-zinc-200 dark:border-zinc-800 px-3">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`${runId}-tab-${t.id}`}
            aria-selected={t.id === current?.id}
            aria-controls={`${runId}-panel-${t.id}`}
            onClick={() => setSelected(t.id)}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-[13px] ${
              t.id === current?.id
                ? "border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100 font-medium"
                : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {current && (
        <div
          role="tabpanel"
          id={`${runId}-panel-${current.id}`}
          aria-labelledby={`${runId}-tab-${current.id}`}
          className="flex flex-col gap-3 px-3 py-3"
        >
          {current.content}
        </div>
      )}
    </div>
  );
}

/**
 * TASK-2592 — the goal's feature under its title. An adapter older than
 * TASK-2590 sends no `feature` field at all, which is not the same as "no
 * feature": it renders nothing rather than a claim the data cannot support.
 */
function FeatureLine({ feature }: { feature: RunFeature | null | undefined }): React.JSX.Element | null {
  if (feature === undefined) return null;
  if (feature === null) {
    return (
      <span data-testid="run-feature-line" className="flex w-full items-center gap-1.5 pl-6 text-[12.5px] text-zinc-400">
        <i className="ti ti-puzzle" aria-hidden="true" />
        No feature
      </span>
    );
  }
  if (feature.missing) {
    return (
      <span data-testid="run-feature-line" className="flex w-full items-center gap-1.5 pl-6 text-[12.5px] text-rose-700 dark:text-rose-400">
        <i className="ti ti-alert-triangle" aria-hidden="true" />
        Feature not found: {feature.slug}
      </span>
    );
  }
  return (
    <span data-testid="run-feature-line" className="flex w-full min-w-0 items-center gap-1.5 pl-6 text-[12.5px] text-violet-700 dark:text-violet-300">
      <i className="ti ti-puzzle" aria-hidden="true" />
      <span className="truncate font-medium">{feature.title}</span>
    </span>
  );
}

function FeatureCard({ feature }: { feature: RunFeature }): React.JSX.Element {
  return (
    <section
      aria-label="Feature"
      className="flex max-w-3xl flex-col gap-1.5 rounded-md border border-violet-200 bg-violet-50 px-3 py-2.5 dark:border-violet-900 dark:bg-violet-950/30"
    >
      <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-violet-700 dark:text-violet-300">
        <i className="ti ti-puzzle" aria-hidden="true" />
        Feature
      </span>
      <h3 className="text-sm font-medium">{feature.title}</h3>
      {feature.why && <p className="text-[13px] text-zinc-600 dark:text-zinc-300">{feature.why}</p>}
      <a
        href={`#/knowledge?slug=${encodeURIComponent(feature.slug)}`}
        className="inline-flex w-fit items-center gap-1 text-xs font-medium text-violet-700 hover:underline dark:text-violet-300"
      >
        Open feature
        <i className="ti ti-external-link" aria-hidden="true" />
      </a>
    </section>
  );
}

function MetaLine({ run, done }: { run: Run; done: number }): React.JSX.Element {
  return (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
            <span className="text-zinc-700 dark:text-zinc-200">
              {done} of {run.items.length} done
            </span>
            {run.prUrls.length > 0 ? (
              run.prUrls.map((u) => (
                <a key={u} href={u} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
                  <i className="ti ti-git-pull-request" aria-hidden="true" />
                  {u.replace(/^https:\/\/github\.com\//, "")}
                </a>
              ))
            ) : (
              <span className="inline-flex items-center gap-1">
                <i className="ti ti-git-pull-request" aria-hidden="true" />
                PR not opened yet
              </span>
            )}
          </div>
  );
}

function Chip({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={[
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[12.5px]",
        active
          ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
          : "border-zinc-200 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300",
      ].join(" ")}
    >
      {label}
      <span className="tabular-nums opacity-70">{count}</span>
    </button>
  );
}

export function RunsView(): React.JSX.Element {
  const health = useOutletContext<HealthView | undefined>();
  const { data, isLoading, isError } = useRuns();
  const [filter, setFilter] = useState<Filter>("all");

  function body(): React.JSX.Element {
    if (health?.conn === "disconnected") {
      return <ErrorState variant="unreachable" description="Couldn't read the runs — this is not 'no runs'." />;
    }
    if (isError) return <ErrorState variant="failed" subject="the runs" />;
    if (isLoading || !data) return <Skeleton shape="list" label="Loading…" />;
    if (data.runs.length === 0 && data.otherNotices.length === 0) {
      return (
        <EmptyState
          icon="ti-player-play"
          title="No runs yet"
          description="A run appears here once /choda-autopilot or /choda-burn-backlog files its first notice."
        />
      );
    }

    const counts = { all: data.runs.length, running: 0, finished: 0, halted: 0 };
    for (const r of data.runs) counts[bucket(r.state)]++;
    const shown = data.runs.filter((r) => filter === "all" || bucket(r.state) === filter);

    // Projects in the order of their newest run; runs arrive newest first.
    const projects: { id: string; name: string; runs: Run[] }[] = [];
    for (const r of shown) {
      let p = projects.find((x) => x.id === r.project.id);
      if (!p) projects.push((p = { id: r.project.id, name: r.project.name, runs: [] }));
      p.runs.push(r);
    }

    return (
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto pb-6">
        <div role="group" aria-label="Filter runs" className="flex flex-wrap gap-1.5">
          <Chip active={filter === "all"} label="All" count={counts.all} onClick={() => setFilter("all")} />
          <Chip active={filter === "running"} label="Running" count={counts.running} onClick={() => setFilter("running")} />
          <Chip active={filter === "finished"} label="Finished" count={counts.finished} onClick={() => setFilter("finished")} />
          <Chip active={filter === "halted"} label="Halted" count={counts.halted} onClick={() => setFilter("halted")} />
        </div>
        {projects.map((p) => (
          <section key={p.id} aria-label={p.name} className="flex flex-col gap-2">
            <h2 className="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-1.5 text-[15px] font-medium">
              <i className="ti ti-folder text-zinc-400" aria-hidden="true" />
              {p.name}
              <span className="text-xs font-normal text-zinc-400">
                {p.runs.length} run{p.runs.length === 1 ? "" : "s"}
              </span>
            </h2>
            {p.runs.map((r) => (
              <RunCard key={r.goal.id} run={r} />
            ))}
          </section>
        ))}
        {filter === "all" && data.otherNotices.length > 0 && (
          <section aria-label="Other loop notices" className="flex flex-col gap-2">
            <h2 className="border-b border-zinc-200 dark:border-zinc-800 pb-1.5 text-[15px] font-medium">
              Other loop notices
            </h2>
            <ul className="flex flex-col gap-1 text-[13px]">
              {data.otherNotices.map((n) => (
                <li key={n.id} className="flex flex-wrap gap-x-3">
                  <time className="font-mono text-[11.5px] text-zinc-400">{when(n.createdAt)}</time>
                  <span className="min-w-0 flex-1">{n.title}</span>
                  {n.workspaceId && <span className="text-[11.5px] text-zinc-400">{n.workspaceId}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    );
  }

  return (
    <section aria-label="runs" className="flex min-h-0 flex-1 flex-col">
      <div className="mb-4 flex items-baseline gap-2">
        <h1 className="text-lg font-medium">Runs</h1>
        <span className="text-xs text-zinc-400">what your loops finished, tested and left for you, by project</span>
      </div>
      {body()}
    </section>
  );
}
