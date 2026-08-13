// TASK-1570 — the conversation picker. Title + status per row; selection drives
// the detail pane.
//
// TASK-1617 — it was "deliberately plain", which stopped working once the store
// filled up. Most threads are machine-generated captures
// (`Screenshot from http://localhost:3000/…`, `GET https://graph.microsoft…`),
// so a plain truncated-title list buries the handful of real discussions that
// anyone actually reads. Captures now get a quieter voice and a shortened
// host … /tail label, and the filter can hide them entirely.

// Kind/status chips answer "what sort of thread", but not "which one" — with a
// store this size the two things you actually arrive with are a project and a
// remembered fragment (an id someone pasted, or a few words from a title). Both
// are client-side over data the list already holds; the adapter has no
// conversation search route.

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

const ALL_PROJECTS = "__all__";

/**
 * The id is matched raw (`CONV-` ids get pasted around and are never typed in
 * the same case), and the text match covers both the original title and the
 * shortened label the row actually shows — searching for what is on screen has
 * to work.
 */
function matchesQuery(c: ConversationSummary, label: string, q: string): boolean {
  if (q.length === 0) return true;
  return (
    c.id.toLowerCase().includes(q) ||
    c.title.toLowerCase().includes(q) ||
    label.toLowerCase().includes(q)
  );
}

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
  const [project, setProject] = useState<string>(ALL_PROJECTS);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const rows = useMemo(
    () => conversations.map((c) => ({ c, meta: conversationLabel(c.title) })),
    [conversations]
  );

  // Counts come from the rows on screen, so an option can never promise
  // matches the list cannot show.
  const projects = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of conversations) counts.set(c.projectId, (counts.get(c.projectId) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [conversations]);

  const shown = useMemo(
    () =>
      rows.filter(({ c, meta }) => {
        if (project !== ALL_PROJECTS && c.projectId !== project) return false;
        if (!matchesQuery(c, meta.label, q)) return false;
        if (filter === "all") return true;
        if (filter === "open" || filter === "decided") return c.status === filter;
        if (filter === "discussion") return meta.kind === "discussion";
        return meta.kind !== "discussion";
      }),
    [rows, filter, project, q]
  );

  const narrowed = filter !== "all" || project !== ALL_PROJECTS || q.length > 0;

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
      <div className="relative flex items-center mb-2">
        <i
          className="ti ti-search absolute left-2.5 text-zinc-400 pointer-events-none"
          aria-hidden="true"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by id or text…"
          aria-label="Search conversations"
          className="w-full pl-7 pr-7 py-1.5 text-[13px] rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 outline-none focus:border-violet-500"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="absolute right-1.5 p-1 rounded text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
          >
            <i className="ti ti-x" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* One project is the common case on a single-workspace laptop — a
          dropdown with a single option would be furniture. */}
      {projects.length > 1 && (
        <select
          value={project}
          onChange={(e) => setProject(e.target.value)}
          aria-label="Filter by project"
          className="mb-2 w-full px-2 py-1.5 text-[13px] rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 outline-none focus:border-violet-500"
        >
          <option value={ALL_PROJECTS}>All projects ({conversations.length})</option>
          {projects.map(([id, n]) => (
            <option key={id} value={id}>
              {id} ({n})
            </option>
          ))}
        </select>
      )}

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
        {narrowed
          ? `${shown.length} of ${conversations.length}`
          : `${conversations.length} threads`}
      </div>

      <div
        data-testid="conversation-list-pane"
        className="flex-1 min-h-0 overflow-y-auto pr-1"
      >
        {shown.length === 0 ? (
          <EmptyState
            icon={q ? "ti-search" : "ti-filter"}
            title={q ? `No conversations match “${query}”` : "Nothing matches this filter"}
            description={q ? "The search covers the conversation id and its title." : undefined}
            action={
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setFilter("all");
                  setProject(ALL_PROJECTS);
                }}
                className="px-3 py-1.5 rounded-md text-sm border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                Clear filters
              </button>
            }
          />
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
