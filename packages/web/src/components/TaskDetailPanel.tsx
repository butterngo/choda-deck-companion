// Task detail for the graph node panel — title, status/priority, blockers,
// labels, and the raw markdown body (Context / Acceptance / …). Presentational;
// the caller fetches via useTask.

import type { TaskDetail } from "../api";

export function TaskDetailPanel({ task }: { task: TaskDetail }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div>
        <div className="font-mono text-xs text-zinc-400">{task.id}</div>
        <div className="font-medium">{task.title}</div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5">{task.status}</span>
        {task.priority && (
          <span className="rounded bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5">{task.priority}</span>
        )}
        {task.labels.map((l) => (
          <span key={l} className="rounded bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 px-1.5 py-0.5">
            {l}
          </span>
        ))}
      </div>
      {task.blockedBy.length > 0 && (
        <div className="text-xs text-amber-700 dark:text-amber-400">
          Blocked by: {task.blockedBy.join(", ")}
        </div>
      )}
      {task.body && (
        <pre className="whitespace-pre-wrap break-words rounded-md bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-2 text-xs leading-relaxed">
          {task.body}
        </pre>
      )}
    </div>
  );
}
