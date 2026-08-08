// TASK-1173 AC-1 — NOW/NEXT/DONE columns from the focus feed. The NOW card shows
// the active session's resume point (handoff, falling back to checkpoint) so the
// Cockpit answers "where did I leave off" without opening choda-tasks directly.
//
// TASK-1596 — column chrome. These were three bare divs, so the board did not
// read as a board: no counts, and nothing distinguishing the column you are
// actually working in. Each column now carries a header with a count and a
// coloured rail, NOW being the one that stands out.
//
// The per-column empty copy is deliberately a compact line rather than the
// shared EmptyState: that component is pane-sized, and three stacked icons
// across an empty board reads as three errors. Strings are unchanged.

import type { FocusFeed, FocusTask } from "../api";

function resumePointOf(feed: FocusFeed): string | null {
  const session = feed.activeSession;
  if (!session) return null;
  return session.handoff?.resumePoint ?? session.checkpoint?.resumePoint ?? null;
}

function TaskCard({ task, resumePoint }: { task: FocusTask; resumePoint?: string | null }): React.JSX.Element {
  return (
    <li className="rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2.5 py-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="mono text-xs text-zinc-500">{task.id}</span>
        {task.priority && <span className="text-xs text-zinc-400">{task.priority}</span>}
      </div>
      <div className="mt-0.5 text-zinc-700 dark:text-zinc-200 leading-snug">{task.title}</div>
      {resumePoint && (
        <div className="mt-2 pt-2 border-t border-dashed border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500">
          ↩ {resumePoint}
        </div>
      )}
    </li>
  );
}

// Rails encode meaning, not decoration: NOW is where the work is, DONE is
// settled, NEXT is neither. Distinct tokens per column so the difference is
// assertable rather than a matter of taste.
const RAIL: Record<string, string> = {
  now: "bg-blue-600 dark:bg-blue-500",
  next: "bg-zinc-300 dark:bg-zinc-700",
  done: "bg-emerald-500 dark:bg-emerald-400",
};

function Column({
  id,
  title,
  tasks,
  resumePointFor,
  emptyLabel,
}: {
  id: "now" | "next" | "done";
  title: string;
  tasks: FocusTask[];
  resumePointFor?: (task: FocusTask) => string | null | undefined;
  emptyLabel: string;
}): React.JSX.Element {
  return (
    <div className="flex-1 min-w-0" data-column={id}>
      <div className="flex items-center gap-2 px-0.5 pb-2">
        <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-400">{title}</h2>
        <span className="ml-auto text-xs tabular-nums text-zinc-400" data-testid={`count-${id}`}>
          {tasks.length}
        </span>
      </div>
      <div className={`h-0.5 rounded mb-2.5 ${RAIL[id]}`} data-testid={`rail-${id}`} />
      {tasks.length === 0 ? (
        <p className="px-0.5 text-sm text-zinc-500">{emptyLabel}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {tasks.map((t) => (
            <TaskCard key={t.id} task={t} resumePoint={resumePointFor?.(t)} />
          ))}
        </ul>
      )}
    </div>
  );
}

export function FocusBoard({ feed }: { feed: FocusFeed }): React.JSX.Element {
  const resumePoint = resumePointOf(feed);
  const resumePointFor = (task: FocusTask): string | null =>
    feed.activeSession?.taskId === task.id ? resumePoint : null;

  return (
    <div className="flex gap-4 items-start" aria-label="focus board">
      <Column
        id="now"
        title="Now"
        tasks={feed.now}
        resumePointFor={resumePointFor}
        emptyLabel="Nothing in progress."
      />
      <Column id="next" title="Next" tasks={feed.next} emptyLabel="Nothing ready." />
      <Column id="done" title="Done (recent)" tasks={feed.done} emptyLabel="Nothing done recently." />
    </div>
  );
}
