// TASK-1174 AC-1/AC-2 — the entry list, filterable by type, each row showing its
// staleness flag from the endpoint (no client-side recomputation).

import type { KnowledgeListItem, KnowledgeType } from "../api";

const TYPES: KnowledgeType[] = ["spike", "decision", "postmortem", "learning", "evaluation", "feature", "code_ref", "gotcha"];

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
        <ul className="flex flex-col gap-1.5" aria-label="knowledge entries">
          {entries.map((e) => (
            <li key={e.slug}>
              <button
                type="button"
                onClick={() => onSelect(e.slug)}
                aria-pressed={selectedSlug === e.slug}
                className={`w-full text-left rounded-md border px-2.5 py-2 text-sm ${
                  selectedSlug === e.slug
                    ? "border-blue-600"
                    : "border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium truncate-title">{e.title}</span>
                  <span className="text-xs text-zinc-400">{e.type}</span>
                </div>
                <div className="text-xs text-zinc-500">{e.slug}</div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
