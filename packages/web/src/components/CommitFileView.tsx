// TASK-1794 — one of a commit's changed files, opened where the reader already is.
//
// This exists because of Butter's feedback, and the feedback was a better design
// than the one it replaced. The previous build sent a changed file to
// /workspace-docs — a top-level route outside the workspace, with no back control
// of any kind. The obvious repair was a breadcrumb. The obvious repair is wrong:
// a commit touching 7 files would then cost 7 round trips through it.
//
// So the commit's OTHER changed files come with the file. Moving between them is
// one click and never leaves this pane, which means "back" is not a control that
// had to be found — it is a trip that no longer happens.
//
// What this pane must not do is overclaim. It shows the file as it is NOW, and
// says so; see resolveChangedLines for why that is a correctness matter and not
// a caption.

import { useWorkspaceDoc } from "../hooks/use-workspace-docs";
import { resolveChangedLines } from "../lib/changed-lines";
import { SourceView } from "./SourceView";
import { Skeleton } from "./state/Skeleton";
import { ErrorState } from "./state/ErrorState";
import type { CommitFileStat } from "../api";

/** A changed file can be opened only when it has text and a patch to place. */
export function isOpenable(file: CommitFileStat): boolean {
  return !file.binary && file.hunks !== undefined && file.hunks !== null;
}

export function CommitFileView({
  files,
  path,
  workspaceId,
  shortSha,
  onSelect,
  onClose,
}: {
  /** Every file the commit changed — the whole point of this component. */
  files: CommitFileStat[];
  path: string;
  workspaceId: string;
  shortSha: string;
  onSelect: (path: string) => void;
  onClose: () => void;
}): React.JSX.Element {
  const doc = useWorkspaceDoc(workspaceId, path);
  const file = files.find((f) => f.path === path) ?? null;

  const resolved =
    file !== null && doc.markdown !== null
      ? resolveChangedLines(file, doc.markdown)
      : { marked: new Set<number>(), drifted: 0 };

  return (
    <div data-testid="commit-file-view" className="flex min-h-0 flex-col gap-2.5">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[11px] text-zinc-400">{shortSha}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-xs">{path}</span>
        <button
          type="button"
          onClick={onClose}
          data-testid="commit-file-close"
          aria-label="Back to the diff"
          className="flex-none rounded-md px-1.5 py-0.5 text-[11px] text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
        >
          Back to diff
        </button>
      </div>

      {/* The other files in this commit. A file that cannot be opened is listed
          but not clickable — a chip that led to a 415 would look like a working
          control, which is the defect this whole epic keeps re-finding. */}
      <ul data-testid="commit-file-chips" className="flex flex-wrap gap-1">
        {files.map((f) => {
          const current = f.path === path;
          const openable = isOpenable(f);
          const label = f.path.split("/").pop() ?? f.path;
          return (
            <li key={f.path}>
              {openable ? (
                <button
                  type="button"
                  onClick={() => onSelect(f.path)}
                  aria-current={current ? "true" : undefined}
                  data-testid={`commit-file-chip-${f.path}`}
                  title={f.path}
                  className={[
                    "rounded border px-1.5 py-px font-mono text-[11px]",
                    current
                      ? "border-zinc-900 dark:border-zinc-100 font-medium"
                      : "border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800/50",
                  ].join(" ")}
                >
                  {label}
                </button>
              ) : (
                <span
                  data-testid={`commit-file-unopenable-${f.path}`}
                  title={`${f.path} — no text to show`}
                  className="rounded border border-dashed border-zinc-300 dark:border-zinc-700 px-1.5 py-px font-mono text-[11px] text-zinc-400"
                >
                  {label}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {/* Stated, never implied. The lines below are the file today; the commit
          is only where the change came from. */}
      <p data-testid="commit-file-asof" className="text-[11px] text-zinc-500">
        Showing this file as it is now — not as it was at {shortSha}.
      </p>

      {resolved.drifted > 0 && (
        <p
          data-testid="file-drifted"
          className="rounded border border-dashed border-amber-400 dark:border-amber-700 px-2 py-1 text-[11px] text-amber-700 dark:text-amber-400"
        >
          {resolved.drifted} changed{" "}
          {resolved.drifted === 1 ? "line is" : "lines are"} not marked — the file has
          moved on since {shortSha}, so those lines are no longer where the commit put
          them.
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {doc.isError ? (
          <ErrorState variant="failed" subject="this file" />
        ) : doc.isBinary ? (
          <p className="px-1 py-4 text-center text-xs text-zinc-500">
            Not text — there are no lines to show.
          </p>
        ) : doc.markdown === null ? (
          <Skeleton shape="list" label="Loading file…" />
        ) : (
          <SourceView path={path} code={doc.markdown} highlightLines={resolved.marked} />
        )}
      </div>
    </div>
  );
}
