// TASK-1173 AC-1 — NOW/NEXT/DONE columns from the focus feed. The NOW card shows
// the active session's resume point (handoff, falling back to checkpoint) so the
// Cockpit answers "where did I leave off" without opening choda-tasks directly.

import type { FocusFeed, FocusTask } from "../api";

function resumePointOf(feed: FocusFeed): string | null {
  const session = feed.activeSession;
  if (!session) return null;
  return session.handoff?.resumePoint ?? session.checkpoint?.resumePoint ?? null;
}

function TaskCard({ task, resumePoint }: { task: FocusTask; resumePoint?: string | null }): React.JSX.Element {
  return (
    <li className="rounded-md border border-zinc-200 dark:border-zinc-800 px-2.5 py-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium truncate-title">{task.id}</span>
        {task.priority && <span className="text-xs text-zinc-400">{task.priority}</span>}
      </div>
      <div className="text-zinc-600 dark:text-zinc-300">{task.title}</div>
      {resumePoint && <div className="mt-1 text-xs text-zinc-500">↩ {resumePoint}</div>}
    </li>
  );
}

function Column({
  title,
  tasks,
  resumePointFor,
  emptyLabel,
}: {
  title: string;
  tasks: FocusTask[];
  resumePointFor?: (task: FocusTask) => string | null | undefined;
  emptyLabel: string;
}): React.JSX.Element {
  return (
    <div className="flex-1 min-w-0">
      <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-400 mb-2">{title}</h2>
      {tasks.length === 0 ? (
        <p className="text-sm text-zinc-500">{emptyLabel}</p>
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
    <div className="flex gap-4" aria-label="focus board">
      <Column title="Now" tasks={feed.now} resumePointFor={resumePointFor} emptyLabel="Nothing in progress." />
      <Column title="Next" tasks={feed.next} emptyLabel="Nothing ready." />
      <Column title="Done (recent)" tasks={feed.done} emptyLabel="Nothing done recently." />
    </div>
  );
}
