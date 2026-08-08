// TASK-1174 AC-1/AC-2 — the entry list, filterable by type, each row showing its
// staleness flag from the endpoint (no client-side recomputation).

import type { KnowledgeListItem, KnowledgeType } from "../api";
import { relativeTime } from "../lib/relative-time";

const TYPES: KnowledgeType[] = ["spike", "decision", "postmortem", "learning", "evaluation", "feature", "code_ref", "gotcha"];

// TASK-1614 — type as a dot rather than a word competing with the title for
// row width. Colour is the coarse signal ("is this a decision or a gotcha?");
// the word stays alongside it for anyone who needs the exact type.
const TYPE_DOT: Record<string, string> = {
  decision: "bg-violet-500",
  gotcha: "bg-amber-500",
  learning: "bg-sky-500",
  spike: "bg-teal-500",
  postmortem: "bg-rose-500",
  evaluation: "bg-indigo-500",
  feature: "bg-emerald-500",
  code_ref: "bg-zinc-400",
};

export function KnowledgeList({
  entries,
  selectedType,
  onSelectType,
  selectedSlug,
  onSelect,
}: {
  entries: KnowledgeListItem[];
  selectedType: KnowledgeType | null;
  onSelectType: (type: KnowledgeType | null) => void;
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="filter by type">
        <button
          type="button"
          onClick={() => onSelectType(null)}
          className={`px-2 py-1 rounded text-xs ${selectedType === null ? "bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900" : "bg-zinc-100 dark:bg-zinc-800"}`}
        >
          all
        </button>
        {TYPES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onSelectType(t)}
            className={`px-2 py-1 rounded text-xs ${selectedType === t ? "bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900" : "bg-zinc-100 dark:bg-zinc-800"}`}
          >
            {t}
          </button>
        ))}
      </div>
      {entries.length === 0 ? (
        <p className="text-sm text-zinc-500">No knowledge entries.</p>
      ) : (
        // TASK-1614 — the title IS the identity, so it gets the room.
        //
        // These were two-line bordered cards showing title + type + slug. The
        // slug never distinguished anything (it is a kebab-cased copy of the
        // title) and 50 bordered cards read as 50 objects rather than one list.
        //
        // Two lines, not one: a one-line title truncates around 30 characters
        // in a 320px pane, and half this store then reads as "Deciding to
        // change nothing still obli…". Type demotes to a coloured dot.
        <ul className="flex flex-col" aria-label="knowledge entries">
          {entries.map((e) => (
            <li key={e.slug}>
              <button
                type="button"
                onClick={() => onSelect(e.slug)}
                aria-pressed={selectedSlug === e.slug}
                title={e.title}
                className={`w-full text-left rounded px-2 py-1.5 ${
                  selectedSlug === e.slug
                    ? "bg-zinc-100 dark:bg-zinc-800"
                    : "hover:bg-zinc-50 dark:hover:bg-zinc-900"
                }`}
              >
                <span
                  className={`block text-[13px] leading-snug line-clamp-2 ${
                    selectedSlug === e.slug
                      ? "font-medium text-zinc-900 dark:text-zinc-100"
                      : "text-zinc-700 dark:text-zinc-200"
                  }`}
                >
                  {e.title}
                </span>
                <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-zinc-400">
                  <span
                    aria-hidden="true"
                    className={`inline-block w-1.5 h-1.5 rounded-full ${TYPE_DOT[e.type] ?? "bg-zinc-400"}`}
                  />
                  {e.type}
                  {relativeTime(e.lastVerifiedAt) && <span>· {relativeTime(e.lastVerifiedAt)}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
