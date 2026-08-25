// TASK-1782 — the workspace's git log, one row per commit.
//
// The rule this component exists to hold: a commit nobody tagged is SHOWN and
// MARKED, never hidden. Measured 2026-08-25 across both repos — 82 of 130
// companion commits and 299 of 541 choda-deck commits carry a TASK-id, so
// filtering to the tagged ones would silently drop about 45% of the history.
// Those are not junk either: mostly `chore(release):` and features from before
// the tagging habit. A view that quietly loses nearly half the log is the
// opposite of an audit.
//
// The date is rendered from the ISO prefix rather than toLocaleDateString: the
// latter varies by the runner's locale, so a test asserting it would pass on one
// machine and fail on another for reasons having nothing to do with the code.

import { Link } from "react-router-dom";
import type { WorkspaceCommit } from "../api";

/** `2026-08-25T17:04:11+07:00` → `2026-08-25`. Locale-independent by design. */
export function commitDate(authorDate: string): string {
  return authorDate.slice(0, 10);
}

function TaskBadges({ taskIds }: { taskIds: string[] }): React.JSX.Element {
  if (taskIds.length === 0) {
    return (
      <span
        data-testid="commit-task-unknown"
        title="No TASK-id in this commit's subject — the work it belongs to is not recorded."
        className="flex-none rounded border border-dashed border-zinc-300 dark:border-zinc-700 px-1.5 py-px text-[11px] text-zinc-400"
      >
        task unknown
      </span>
    );
  }
  return (
    <>
      {taskIds.map((id) => (
        <Link
          key={id}
          to={`/tasks/${encodeURIComponent(id)}`}
          data-testid={`commit-task-${id}`}
          className="flex-none rounded border border-zinc-200 dark:border-zinc-800 px-1.5 py-px font-mono text-[11px] hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
        >
          {id}
        </Link>
      ))}
    </>
  );
}

export function CommitList({
  commits,
  selected,
  onSelect,
}: {
  commits: WorkspaceCommit[];
  /** sha of the open panel, or null. */
  selected?: string | null;
  onSelect?: (sha: string) => void;
}): React.JSX.Element {
  return (
    <ul
      data-testid="commit-list"
      className="rounded-md border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-200 dark:divide-zinc-800 overflow-hidden"
    >
      {commits.map((c) => (
        <li key={c.sha} data-testid={`commit-row-${c.shortSha}`}>
          <div
            className={[
              "flex items-baseline gap-2.5 px-2.5 py-2",
              selected === c.sha ? "bg-zinc-100 dark:bg-zinc-800" : "",
            ].join(" ")}
          >
            {/* The sha opens the panel; the task badges stay their own links, so
                clicking "TASK-1767" still goes to the task rather than being
                swallowed by a row-level handler. Nesting them inside one button
                would make the badge unreachable. */}
            {onSelect ? (
              <button
                type="button"
                onClick={() => onSelect(c.sha)}
                data-testid={`commit-open-${c.shortSha}`}
                aria-expanded={selected === c.sha}
                className="w-16 flex-none text-left font-mono text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
              >
                {c.shortSha}
              </button>
            ) : (
              <span className="w-16 flex-none font-mono text-xs text-zinc-500">{c.shortSha}</span>
            )}
            <span className="min-w-0 flex-1 truncate text-xs" title={c.subject}>
              {c.subject}
            </span>
            <TaskBadges taskIds={c.taskIds} />
            <span className="w-24 flex-none text-right text-[11px] tabular-nums text-zinc-400">
              {commitDate(c.authorDate)}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
