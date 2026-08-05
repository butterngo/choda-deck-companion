// TASK-1570 — the conversation picker. Title + status per row; selection drives
// the detail pane. Deliberately plain: the payload the user is here for lives in
// the messages, not in the list.

import type { ConversationSummary } from "../api";

const STATUS_STYLE: Record<string, string> = {
  open: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  decided: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
};

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
}: {
  conversations: ConversationSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}): React.JSX.Element {
  if (conversations.length === 0) {
    return <p className="text-sm text-zinc-500">No conversations yet.</p>;
  }
  return (
    <ul aria-label="conversations" className="flex flex-col gap-1">
      {conversations.map((c) => (
        <li key={c.id}>
          <button
            type="button"
            onClick={() => onSelect(c.id)}
            aria-current={c.id === selectedId}
            className={`w-full text-left rounded px-2 py-1.5 text-sm flex items-center justify-between gap-2 ${
              c.id === selectedId
                ? "bg-zinc-100 dark:bg-zinc-800"
                : "hover:bg-zinc-50 dark:hover:bg-zinc-900"
            }`}
          >
            <span className="truncate">{c.title}</span>
            <span
              className={`shrink-0 text-xs px-1.5 py-0.5 rounded ${
                STATUS_STYLE[c.status] ?? "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
              }`}
            >
              {c.status}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
