// TASK-1173 AC-2 — plain triage list of raw/ready inbox items for the focus
// project. Read-only here; conversion to a task stays a choda-tasks-side action.

import type { InboxItem } from "../api";

export function InboxTriage({ items }: { items: InboxItem[] }): React.JSX.Element {
  if (items.length === 0) {
    return <p className="text-sm text-zinc-500">Inbox is clear.</p>;
  }
  return (
    <ul className="flex flex-col gap-2" aria-label="inbox triage">
      {items.map((i) => (
        <li key={i.id} className="rounded-md border border-zinc-200 dark:border-zinc-800 px-2.5 py-2 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">{i.id}</span>
            <span className="text-xs text-zinc-400">{i.status}</span>
          </div>
          <div className="text-zinc-600 dark:text-zinc-300 line-clamp-2">{i.content}</div>
        </li>
      ))}
    </ul>
  );
}
