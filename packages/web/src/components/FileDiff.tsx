// TASK-1792 — the changed lines of one file in a commit.
//
// Three absences, and collapsing any two of them tells the reader something
// untrue. They are deliberately three separate branches rather than one
// "no diff available":
//
//   hunks === undefined  the adapter does not serve diffs at all. Nothing is
//                        wrong with this file or this commit; the vendored
//                        bundle simply lags a release (INBOX-1888).
//   hunks === null       the patch was not produced for THIS file — binary, or
//                        past the size cap. `omitted` says which.
//   hunks === []         genuinely no lines changed. A mode change, or a rename
//                        with no edit.
//
// Line numbers come from the adapter, which computes them from git rather than
// from the position within a hunk. A number that merely looks right is worse
// than none here: it sends a reader to the wrong line of a real file, and
// nothing about the result announces the mistake.

import { Link } from "react-router-dom";
import type { CommitFileStat, DiffLine } from "../api";

const MARK: Record<DiffLine["kind"], string> = { add: "+", del: "-", ctx: " " };

const ROW_CLASS: Record<DiffLine["kind"], string> = {
  add: "bg-emerald-50 dark:bg-emerald-950/30",
  del: "bg-rose-50 dark:bg-rose-950/30",
  ctx: "",
};

function Line({ line }: { line: DiffLine }): React.JSX.Element {
  return (
    <div
      data-testid={`diff-line-${line.kind}`}
      data-old-no={line.oldNo ?? undefined}
      data-new-no={line.newNo ?? undefined}
      className={`grid grid-cols-[3rem_3rem_1rem_1fr] gap-2 ${ROW_CLASS[line.kind]}`}
    >
      {/* Both numbers are shown. An added line has no old number and a removed
          line has no new one, and leaving the cell blank says that more
          plainly than repeating the other column would. */}
      <span aria-hidden="true" className="select-none pr-1 text-right tabular-nums text-zinc-400">
        {line.oldNo ?? ""}
      </span>
      <span aria-hidden="true" className="select-none pr-1 text-right tabular-nums text-zinc-400">
        {line.newNo ?? ""}
      </span>
      <span aria-hidden="true" className="select-none text-zinc-400">
        {MARK[line.kind]}
      </span>
      <span className="whitespace-pre-wrap break-all">{line.text}</span>
    </div>
  );
}

/** The first line a reader should be taken to, or null when there is nowhere. */
export function firstChangedLine(file: CommitFileStat): number | null {
  if (!file.hunks) return null;
  for (const h of file.hunks) {
    for (const l of h.lines) {
      if (l.kind === "add" && l.newNo !== null) return l.newNo;
    }
  }
  // A pure deletion has no line in the new file to land on. The hunk start is
  // where the removal happened; returning nothing would leave the reader with
  // no destination at all.
  for (const h of file.hunks) {
    if (h.lines.some((l) => l.kind === "del")) return h.newStart;
  }
  return null;
}

export function FileDiff({
  file,
  workspaceId,
}: {
  file: CommitFileStat;
  workspaceId: string;
}): React.JSX.Element {
  const line = firstChangedLine(file);
  const openable = file.hunks !== undefined && file.hunks !== null && !file.binary;

  return (
    <div data-testid={`file-diff-${file.path}`} className="rounded-md border border-zinc-200 dark:border-zinc-800 overflow-hidden">
      <div className="flex items-baseline gap-2.5 bg-zinc-50 dark:bg-zinc-900 px-2.5 py-1.5">
        {openable ? (
          <Link
            data-testid={`file-open-${file.path}`}
            to={`/workspace-docs?workspaceId=${encodeURIComponent(workspaceId)}&path=${encodeURIComponent(file.path)}${line === null ? "" : `&line=${line}`}`}
            className="min-w-0 flex-1 truncate font-mono text-xs"
            title={line === null ? file.path : `${file.path} — opens at line ${line}`}
          >
            {file.path}
          </Link>
        ) : (
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-zinc-500">
            {file.path}
          </span>
        )}
        {file.oldPath && (
          <span className="flex-none text-[11px] text-zinc-400">renamed from {file.oldPath}</span>
        )}
        {file.binary ? (
          <span className="flex-none text-[11px] text-zinc-400">binary</span>
        ) : (
          <span className="flex-none font-mono text-[11px] tabular-nums">
            <span className="text-emerald-600 dark:text-emerald-400">+{file.insertions}</span>{" "}
            <span className="text-rose-600 dark:text-rose-400">−{file.deletions}</span>
          </span>
        )}
      </div>

      {file.hunks === undefined ? (
        <p data-testid={`diff-unsupported-${file.path}`} className="px-2.5 py-2 text-[11px] text-zinc-500">
          This adapter does not serve diffs. The counts above are complete; the lines need a newer
          adapter.
        </p>
      ) : file.hunks === null ? (
        <p data-testid={`diff-omitted-${file.path}`} className="px-2.5 py-2 text-[11px] text-zinc-500">
          {file.omitted === "binary"
            ? "Not text — there are no lines to show."
            : "Too large to show line by line. The counts above are still exact."}
        </p>
      ) : file.hunks.length === 0 ? (
        <p data-testid={`diff-empty-${file.path}`} className="px-2.5 py-2 text-[11px] text-zinc-500">
          No lines changed — the file was touched without its content moving.
        </p>
      ) : (
        <div className="overflow-x-auto font-mono text-[11.5px] leading-relaxed">
          {file.hunks.map((h) => (
            <div key={`${h.oldStart}-${h.newStart}`}>
              <div
                data-testid="diff-hunk-header"
                className="bg-zinc-100 dark:bg-zinc-800/60 px-2.5 py-0.5 text-[11px] text-zinc-500"
              >
                @@ −{h.oldStart},{h.oldLines} +{h.newStart},{h.newLines} @@ {h.header}
              </div>
              {h.lines.map((l, i) => (
                <Line key={`${l.kind}-${l.oldNo ?? "x"}-${l.newNo ?? "x"}-${i}`} line={l} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
