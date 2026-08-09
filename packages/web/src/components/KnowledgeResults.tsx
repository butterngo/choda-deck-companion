// TASK-1602 — search results, rendered IN PLACE OF the entry list.
//
// The previous version stacked results above the full list, so after a search
// the pane held two competing lists — and the type filter chips still applied
// to the one underneath, which the results ignored. Replacing the list is the
// whole change: one list on screen, one way back.

import type { KnowledgeSearchHit } from "../api";
import { relativeTime } from "../lib/relative-time";
import { TYPE_DOT } from "./KnowledgeList";

export function KnowledgeResults({
  hits,
  selectedSlug,
  onSelect,
}: {
  hits: KnowledgeSearchHit[];
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
}): React.JSX.Element {
  return (
    <ul className="flex flex-col" aria-label="search results">
      {hits.map((hit) => {
        const selected = hit.slug === selectedSlug;
        return (
          <li key={hit.slug}>
            <button
              type="button"
              onClick={() => onSelect(hit.slug)}
              aria-pressed={selected}
              title={hit.title}
              className={`w-full text-left rounded px-2 py-1.5 ${
                selected ? "bg-zinc-100 dark:bg-zinc-800" : "hover:bg-zinc-50 dark:hover:bg-zinc-900"
              }`}
            >
              <span
                className={`block text-[13px] leading-snug line-clamp-2 ${
                  selected
                    ? "font-medium text-zinc-900 dark:text-zinc-100"
                    : "text-zinc-700 dark:text-zinc-200"
                }`}
              >
                {hit.title}
              </span>
              <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-zinc-400">
                <span
                  aria-hidden="true"
                  className={`inline-block w-1.5 h-1.5 rounded-full ${TYPE_DOT[hit.type] ?? "bg-zinc-400"}`}
                />
                {hit.type}
                {relativeTime(hit.lastVerifiedAt) && <span>· {relativeTime(hit.lastVerifiedAt)}</span>}
              </span>
              {/* Present only when the adapter is new enough to send it — a
                  running instance predating TASK-1599 omits the field. Rendered
                  as plain text with NO highlight: the search is semantic, so a
                  hit may share no literal term with the query and marking one
                  would claim a match that is not there. */}
              {hit.excerpt && (
                <span className="mt-1 block text-[11.5px] leading-relaxed text-zinc-500 line-clamp-2">
                  {hit.excerpt}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
