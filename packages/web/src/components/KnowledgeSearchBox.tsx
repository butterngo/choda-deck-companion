// TASK-1174 AC-3 — search box over GET /knowledge/search. Degrades gracefully:
// when the server reports enabled:false it shows the reason, never an error.

import { useState } from "react";
import { useKnowledgeSearch } from "../hooks/use-knowledge-search";

export function KnowledgeSearchBox({ onSelect }: { onSelect: (slug: string) => void }): React.JSX.Element {
  const [query, setQuery] = useState("");
  const { result, isSearching, isError, search } = useKnowledgeSearch();

  return (
    <div className="mb-3">
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          search(query);
        }}
      >
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search knowledge…"
          className="px-2 py-1.5 rounded-md text-sm border border-zinc-300 dark:border-zinc-700 bg-transparent flex-1"
        />
        <button
          type="submit"
          disabled={isSearching}
          className="px-3 py-1.5 rounded-md text-sm bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-50"
        >
          Search
        </button>
      </form>
      {isError && (
        <p role="alert" className="mt-2 text-sm text-rose-700 dark:text-rose-400">
          Search failed — try again.
        </p>
      )}
      {result && !result.enabled && (
        <p className="mt-2 text-sm text-zinc-500">Search is disabled server-side{result.reason ? `: ${result.reason}` : "."}</p>
      )}
      {result && result.enabled && (
        <ul className="mt-2 flex flex-col gap-1" aria-label="search results">
          {result.results.length === 0 ? (
            <p className="text-sm text-zinc-500">No matches.</p>
          ) : (
            result.results.map((r) => (
              <li key={r.slug}>
                <button
                  type="button"
                  onClick={() => onSelect(r.slug)}
                  className="w-full text-left rounded-md border border-zinc-200 dark:border-zinc-800 px-2.5 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900"
                >
                  {r.title} <span className="text-xs text-zinc-400">{r.slug}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
