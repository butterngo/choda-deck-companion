// TASK-2049 — what a project has in the vault, on the project itself.
//
// A meeting note is saved to vault/10-Projects/<projectId>/meetings/<folder>/,
// and the projectId in that path is the same id this view already lists. The
// mapping has always existed in the code and was shown nowhere, so "where did
// that note go?" had no answer inside the app.
//
// Three states, all real on disk today:
//   * a folder with meetings and no context.md
//   * a meeting holding a transcript and no note — someone transcribed and stopped
//   * no folder at all, which five of twelve registered projects are in
//
// The third is the one worth care: "nothing has ever been saved here" is not an
// error and not an empty list, and it must not render like either.
//
// Collapse follows the TASK-2005 rule from MeetingRow — a body that has been
// opened stays MOUNTED and is merely hidden, so nothing it holds is discarded.
import { useEffect, useState } from "react";
import type { ProjectVault, VaultMeeting } from "../api";
import { fetchProjectVault, ProjectVaultRouteMissingError } from "../api";
import { ErrorState } from "../components/state/ErrorState";
import { Skeleton } from "../components/state/Skeleton";
import { CapabilityNote } from "../components/state/CapabilityNote";

type State =
  | { kind: "loading" }
  | { kind: "route-missing" }
  | { kind: "failed" }
  | { kind: "ready"; vault: ProjectVault };

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function Chevron({ open }: { open: boolean }): React.JSX.Element {
  return (
    <i
      className={`ti ti-chevron-down text-zinc-400 transition-transform ${open ? "" : "-rotate-90"}`}
      aria-hidden="true"
    />
  );
}

function CopyPath({ path, label }: { path: string; label: string }): React.JSX.Element {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      aria-label={`Copy path ${label}`}
      onClick={() => {
        // A denied clipboard must not report success — the path is selectable
        // text either way, so the user can still take it by hand.
        void navigator.clipboard
          .writeText(path)
          .then(() => {
            setDone(true);
            window.setTimeout(() => setDone(false), 1500);
          })
          .catch(() => setDone(false));
      }}
      className="flex-none text-[11.5px] text-blue-600 dark:text-blue-400 hover:underline"
    >
      {done ? "Copied" : "Copy path"}
    </button>
  );
}

function MeetingRow({
  meeting,
  folderPath,
  open,
  onToggle,
}: {
  meeting: VaultMeeting;
  folderPath: string;
  /** Owned by the parent so Expand all can drive every row WITHOUT remounting. */
  open: boolean;
  onToggle: () => void;
}): React.JSX.Element {
  // Mounted-but-hidden after the first open, the TASK-2005 rule. Kept per-row
  // and never reset: once this body has existed it is only ever hidden.
  const [everOpened, setEverOpened] = useState(open);
  useEffect(() => {
    if (open) setEverOpened(true);
  }, [open]);

  return (
    <li className="rounded-md border border-zinc-200 dark:border-zinc-800 px-3 py-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="w-full flex items-baseline gap-2 text-left"
        data-testid={`vault-meeting-${meeting.folder}`}
      >
        <Chevron open={open} />
        <span className="text-sm font-medium">{meeting.slug ?? meeting.folder}</span>
        {/* A folder made by hand carries no date. "Unknown" is a different claim
            from "not a meeting", so it is said rather than left blank. */}
        <span className="text-[11.5px] tabular-nums text-zinc-400 font-mono">
          {meeting.date ?? "date unknown"}
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          {meeting.files.map((f) => (
            <span
              key={f.name}
              data-testid={`file-chip-${meeting.folder}-${f.name}`}
              className={
                f.present
                  ? "text-[11px] font-mono text-zinc-500 border border-zinc-200 dark:border-zinc-800 rounded px-1.5"
                  : "text-[11px] font-mono text-amber-700 dark:text-amber-400 border border-dashed border-amber-300 dark:border-amber-800 rounded px-1.5"
              }
            >
              {f.present ? f.name : `no ${f.name}`}
            </span>
          ))}
        </span>
      </button>

      {everOpened && (
        <div hidden={!open} data-testid={`vault-meeting-body-${meeting.folder}`} className="mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-800 flex flex-col gap-1.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-mono text-[11px] text-zinc-500 truncate" title={`${folderPath}/${meeting.folder}`}>
              {folderPath}/{meeting.folder}
            </span>
            <CopyPath path={`${folderPath}/${meeting.folder}`} label={meeting.folder} />
          </div>
          {meeting.files.map((f) => (
            <div key={f.name} className="flex items-center gap-2 min-w-0">
              <span
                className={`font-mono text-[11.5px] ${f.present ? "text-zinc-600 dark:text-zinc-300" : "text-amber-700 dark:text-amber-400"}`}
              >
                {f.name}
              </span>
              <span className="text-[11px] text-zinc-400 tabular-nums">
                {f.present && f.bytes !== null ? formatBytes(f.bytes) : "never saved"}
              </span>
              {f.present && (
                <span className="ml-auto">
                  <CopyPath path={`${folderPath}/${meeting.folder}/${f.name}`} label={f.name} />
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </li>
  );
}

export function ProjectVaultBlock({ projectId }: { projectId: string }): React.JSX.Element {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [open, setOpen] = useState(true);
  // The set of OPEN meeting folders. Held here rather than in each row so
  // Expand all can drive them all without remounting any — a remount would
  // discard the body, which is exactly what the TASK-2005 rule forbids.
  const [openFolders, setOpenFolders] = useState<ReadonlySet<string>>(new Set());

  function toggleFolder(folder: string): void {
    setOpenFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folder)) next.delete(folder);
      else next.add(folder);
      return next;
    });
  }

  useEffect(() => {
    const ctrl = new AbortController();
    setState({ kind: "loading" });
    fetchProjectVault(projectId, ctrl.signal)
      .then((vault) => setState({ kind: "ready", vault }))
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        setState(err instanceof ProjectVaultRouteMissingError ? { kind: "route-missing" } : { kind: "failed" });
      });
    return () => ctrl.abort();
  }, [projectId]);

  function inner(): React.JSX.Element {
    if (state.kind === "loading") return <Skeleton shape="list" label="Loading vault folder…" />;
    if (state.kind === "route-missing") {
      return (
        <CapabilityNote icon="ti-notebook">
          Vault folders need a newer adapter than this build carries. Everything else on this page
          still works.
        </CapabilityNote>
      );
    }
    if (state.kind === "failed") return <ErrorState variant="failed" subject="vault folder" />;

    const { vault } = state;

    // "Nothing has ever been saved here" — not an error, not an empty list.
    // Named as its own state because five of twelve projects are in it, and it
    // must read differently from a folder that exists and holds no meetings.
    if (!vault.exists) {
      return (
        <div
          data-testid="vault-absent"
          className="flex flex-col items-center text-center gap-1 px-5 py-8 text-zinc-600 dark:text-zinc-300"
        >
          <span className="mb-1.5 grid place-items-center w-8 h-8 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-400">
            <i className="ti ti-folder-off" aria-hidden="true" />
          </span>
          <span className="font-medium text-zinc-900 dark:text-zinc-100">Nothing in the vault yet</span>
          <span className="text-sm max-w-[44ch] leading-relaxed">
            The folder is created the first time you save a meeting note to this project. Nothing is
            written until then.
          </span>
          <span className="font-mono text-[11.5px] text-zinc-500">{vault.relativePath}</span>
        </div>
      );
    }

    return (
      <div className="rounded-md border border-zinc-200 dark:border-zinc-800 overflow-hidden" data-testid="vault-present">
        <div className="flex items-center gap-2 flex-wrap px-3 py-2 bg-violet-50 dark:bg-violet-950/40 border-b border-zinc-200 dark:border-zinc-800">
          <i className="ti ti-folder text-violet-600 dark:text-violet-300" aria-hidden="true" />
          <span
            className="font-mono text-[11.5px] text-violet-700 dark:text-violet-300 truncate min-w-0"
            title={vault.relativePath}
            data-testid="vault-path"
          >
            {vault.relativePath}
          </span>
          <span className="ml-auto flex-none">
            <CopyPath path={vault.relativePath} label={vault.relativePath} />
          </span>
        </div>

        <div className="px-3 py-2.5 flex flex-col gap-3">
          <div className="flex items-baseline gap-2 text-[12.5px]">
            <span className="text-zinc-500">Project note</span>
            {vault.contextFile ? (
              <span
                data-testid="context-present"
                className="rounded-full bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 px-2 py-0.5 text-[11px] font-medium"
              >
                context.md
              </span>
            ) : (
              <span
                data-testid="context-absent"
                className="rounded-full bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900 px-2 py-0.5 text-[11px] font-medium"
              >
                context.md missing
              </span>
            )}
          </div>

          {vault.meetings.length === 0 ? (
            <p className="text-[12.5px] text-zinc-500" data-testid="vault-no-meetings">
              No meetings saved here yet.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <h4 className="text-[11px] uppercase tracking-wide text-zinc-400">Meetings</h4>
                <span className="text-[11px] tabular-nums text-zinc-400">{vault.meetings.length}</span>
                <button
                  type="button"
                  onClick={() =>
                    setOpenFolders((prev) =>
                      // The label follows the state it PRODUCED: all-open means
                      // the next press collapses. Derived from the set rather
                      // than from a separate flag, which could disagree with it
                      // after a single row was toggled by hand.
                      prev.size === vault.meetings.length
                        ? new Set()
                        : new Set(vault.meetings.map((m) => m.folder)),
                    )
                  }
                  className="ml-auto text-[11.5px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                  data-testid="vault-expand-all"
                >
                  {openFolders.size === vault.meetings.length ? "Collapse all" : "Expand all"}
                </button>
              </div>
              <ul className="flex flex-col gap-1.5" data-testid="vault-meetings">
                {vault.meetings.map((m) => (
                  <MeetingRow
                    key={m.folder}
                    meeting={m}
                    folderPath={`${vault.relativePath}/meetings`}
                    open={openFolders.has(m.folder)}
                    onToggle={() => toggleFolder(m.folder)}
                  />
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-2" aria-label="vault folder">
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 text-left"
          data-testid="vault-block-toggle"
        >
          <Chevron open={open} />
          <i className="ti ti-notebook text-zinc-400" aria-hidden="true" />
          <h3 className="text-[11px] uppercase tracking-wide text-zinc-400">Vault</h3>
        </button>
      </div>
      <div hidden={!open} data-testid="vault-block-body">
        {inner()}
      </div>
    </section>
  );
}
