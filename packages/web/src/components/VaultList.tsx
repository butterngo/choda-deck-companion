// TASK-1616 — the vault list, with the filter it never had.
//
// Filtering is client-side over title + tags, which the client already holds
// for every note. That is deliberate, not a shortcut: the adapter has no vault
// search route, and adding one would only be needed to search note BODIES.
// Title and tags cover "where is that DMN note" instantly and cost no request.
//
// Two kinds of note live in this store and used to be indistinguishable:
// `/choda-watch` video notes carry a quoted frontmatter title, hand-written
// notes have no `title:` at all and fall back to a raw kebab-case slug. The
// icon and the mono treatment say which is which instead of leaving a list
// half sentences and half filenames.

import { useMemo, useState } from "react";
import type { VaultNoteSummary } from "../api";
import { relativeTime } from "../lib/relative-time";
import { EmptyState } from "./state/EmptyState";

/** A note whose title is just its slug never had frontmatter to begin with. */
function isSlugTitle(note: VaultNoteSummary): boolean {
  return note.title === note.slug;
}

/** Frontmatter titles arrive quoted (`"All About DMN, Part 1"`). */
function displayTitle(note: VaultNoteSummary): string {
  return note.title.replace(/^["']|["']$/g, "");
}

function matches(note: VaultNoteSummary, q: string): boolean {
  if (q.length === 0) return true;
  const needle = q.startsWith("#") ? q.slice(1) : q;
  return (
    displayTitle(note).toLowerCase().includes(needle) ||
    note.slug.toLowerCase().includes(needle) ||
    note.tags.some((t) => t.toLowerCase().includes(needle))
  );
}

export function VaultList({
  notes,
  selectedSlug,
  onSelect,
}: {
  notes: VaultNoteSummary[];
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
}): React.JSX.Element {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  // Tags are this store's real navigation axis — 30 of them across 54 notes —
  // and they were rendered as inert text inside rows.
  const tags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const n of notes) for (const t of n.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [notes]);

  const shown = useMemo(() => notes.filter((n) => matches(n, q)), [notes, q]);

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
          placeholder="Filter by title or tag…"
          aria-label="Filter notes"
          className="w-full pl-7 pr-7 py-1.5 text-[13px] rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 outline-none focus:border-violet-500"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear filter"
            className="absolute right-1.5 p-1 rounded text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
          >
            <i className="ti ti-x" aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-0.5 px-0.5" role="group" aria-label="filter by tag">
        {tags.slice(0, 12).map(([tag, n]) => {
          const active = q === tag.toLowerCase();
          return (
            <button
              key={tag}
              type="button"
              onClick={() => setQuery(active ? "" : tag)}
              aria-pressed={active}
              title={`${n} note${n === 1 ? "" : "s"}`}
              className={`flex-none px-2 py-0.5 rounded-full text-[11.5px] border whitespace-nowrap ${
                active
                  ? "bg-violet-50 dark:bg-violet-950/40 border-violet-500 text-violet-700 dark:text-violet-300 font-medium"
                  : "border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:border-violet-400"
              }`}
            >
              #{tag}
            </button>
          );
        })}
      </div>

      <div className="text-[11px] text-zinc-400 tabular-nums pb-1">
        {q ? `${shown.length} of ${notes.length}` : `${notes.length} notes`}
      </div>

      <div
        data-testid="vault-list-pane"
        className="flex-1 min-h-0 max-h-[calc(100vh-20rem)] overflow-y-auto pr-1"
      >
        {shown.length === 0 ? (
          <EmptyState
            icon="ti-search"
            title={`No notes match “${query}”`}
            description="The filter covers titles and tags. Note bodies are not searchable yet."
            action={
              <button
                type="button"
                onClick={() => setQuery("")}
                className="px-3 py-1.5 rounded-md text-sm border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                Clear filter
              </button>
            }
          />
        ) : (
          <ul className="flex flex-col" aria-label="vault notes">
            {shown.map((note) => {
              const selected = note.slug === selectedSlug;
              const slugOnly = isSlugTitle(note);
              return (
                <li key={note.slug}>
                  <button
                    type="button"
                    onClick={() => onSelect(note.slug)}
                    aria-pressed={selected}
                    title={displayTitle(note)}
                    className={`w-full text-left rounded px-2 py-1.5 flex items-start gap-2 ${
                      selected
                        ? "bg-violet-50 dark:bg-violet-950/40"
                        : "hover:bg-zinc-50 dark:hover:bg-zinc-900"
                    }`}
                  >
                    <i
                      className={`ti ${note.url ? "ti-player-play" : "ti-file-text"} mt-0.5 flex-none ${
                        selected ? "text-violet-600 dark:text-violet-400" : "text-zinc-400"
                      }`}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block leading-snug line-clamp-2 ${
                          slugOnly ? "mono text-[12px] text-zinc-600 dark:text-zinc-300" : "text-[13px]"
                        } ${selected ? "font-medium text-zinc-900 dark:text-zinc-100" : "text-zinc-700 dark:text-zinc-200"}`}
                      >
                        {displayTitle(note)}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-zinc-400">
                        {/* Provenance stays visible: 30-Knowledge is otherwise
                            hand-written, so a generated note must not pass as
                            one Butter reasoned through. */}
                        {note.generatedBy === "claude" && (
                          <span
                            aria-hidden="true"
                            title="Generated by Claude"
                            className="inline-block w-1.5 h-1.5 rounded-full bg-violet-500 opacity-70"
                          />
                        )}
                        {relativeTime(note.captured) || note.captured || ""}
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
