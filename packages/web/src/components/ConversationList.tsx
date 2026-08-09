// TASK-1570 — the conversation picker. Title + status per row; selection drives
// the detail pane.
//
// TASK-1617 — it was "deliberately plain", which stopped working once the store
// filled up. Most threads are machine-generated captures
// (`Screenshot from http://localhost:3000/…`, `GET https://graph.microsoft…`),
// so a plain truncated-title list buries the handful of real discussions that
// anyone actually reads. Captures now get a quieter voice and a shortened
// host … /tail label, and the filter can hide them entirely.

import { useMemo, useState } from "react";
import type { ConversationSummary } from "../api";
import { conversationLabel, type ConversationKind } from "../lib/conversation-kind";
import { relativeTime } from "../lib/relative-time";
import { EmptyState } from "./state/EmptyState";

type Filter = "all" | "open" | "decided" | "discussion" | "capture";

const FILTERS: ReadonlyArray<{ id: Filter; label: string }> = [
  { id: "all", label: "All" },
  { id: "open", label: "Open" },
  { id: "decided", label: "Decided" },
  { id: "discussion", label: "Discussions" },
  { id: "capture", label: "Captures" },
];

const KIND_ICON: Record<ConversationKind, string> = {
  capture: "ti-camera",
  request: "ti-arrows-left-right",
  discussion: "ti-messages",
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
  const [filter, setFilter] = useState<Filter>("all");

  const rows = useMemo(
    () => conversations.map((c) => ({ c, meta: conversationLabel(c.title) })),
    [conversations]
  );

  const shown = useMemo(
    () =>
      rows.filter(({ c, meta }) => {
        if (filter === "all") return true;
        if (filter === "open" || filter === "decided") return c.status === filter;
        if (filter === "discussion") return meta.kind === "discussion";
        return meta.kind !== "discussion";
      }),
    [rows, filter]
  );

  if (conversations.length === 0) {
    return (
      <EmptyState
        icon="ti-messages"
        title="No conversations yet"
        description="Threads opened from a review, or captures sent from the extension, appear here."
      />
    );
  }

  return (
    <div className="flex flex-col min-h-0">
      <div className="flex gap-1.5 overflow-x-auto pb-2" role="group" aria-label="filter conversations">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            aria-pressed={filter === f.id}
            className={`flex-none px-2 py-0.5 rounded-full text-[11.5px] border whitespace-nowrap ${
              filter === f.id
                ? "bg-zinc-100 dark:bg-zinc-800 border-zinc-400 dark:border-zinc-600 text-zinc-900 dark:text-zinc-100 font-medium"
                : "border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:border-zinc-400"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="text-[11px] text-zinc-400 tabular-nums pb-1">
        {filter === "all"
          ? `${conversations.length} threads`
          : `${shown.length} of ${conversations.length}`}
      </div>

      <div
        data-testid="conversation-list-pane"
        className="flex-1 min-h-0 max-h-[calc(100vh-17rem)] overflow-y-auto pr-1"
      >
        {shown.length === 0 ? (
          <EmptyState icon="ti-filter" title="Nothing matches this filter" />
        ) : (
          <ul aria-label="conversations" className="flex flex-col">
            {shown.map(({ c, meta }) => {
              const selected = c.id === selectedId;
              const isCapture = meta.kind !== "discussion";
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(c.id)}
                    aria-current={selected}
                    title={meta.full}
                    className={`w-full text-left rounded px-2 py-1.5 flex items-start gap-2 ${
                      selected ? "bg-zinc-100 dark:bg-zinc-800" : "hover:bg-zinc-50 dark:hover:bg-zinc-900"
                    }`}
                  >
                    <i
                      className={`ti ${KIND_ICON[meta.kind]} mt-0.5 flex-none text-zinc-400`}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block leading-snug line-clamp-2 ${
                          isCapture ? "mono text-[12px] text-zinc-500 dark:text-zinc-400" : "text-[13px]"
                        } ${
                          selected
                            ? "font-medium text-zinc-900 dark:text-zinc-100"
                            : isCapture
                              ? ""
                              : "text-zinc-700 dark:text-zinc-200"
                        }`}
                      >
                        {meta.label}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-zinc-400">
                        <span
                          aria-hidden="true"
                          className={`inline-block w-1.5 h-1.5 rounded-full ${
                            c.status === "open" ? "bg-blue-500" : "bg-zinc-400"
                          }`}
                        />
                        {c.status}
                        {c.createdBy && <span>· {c.createdBy}</span>}
                        {relativeTime(c.createdAt) && <span>· {relativeTime(c.createdAt)}</span>}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
