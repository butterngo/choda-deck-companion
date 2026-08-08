// TASK-1493 — the Search pillar: one box that queries across ALL project
// workspaces (tasks + knowledge), results grouped by project. Unlike Cockpit /
// Graph it needs no WorkspaceSelect — cross-project is the whole point. Honest
// liveness (reuses the shell health context, same as the other pillars).

import { useState } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import type { HealthView } from "../hooks/use-health";
import { useSearch } from "../hooks/use-search";
import { SearchResults } from "../components/SearchResults";
import { ErrorState } from "../components/state/ErrorState";

export function SearchView(): React.JSX.Element {
  const health = useOutletContext<HealthView>();
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const search = useSearch(query);

  return (
    <section aria-label="cross-project search">
      <h1 className="text-lg font-medium mb-3">Search</h1>

      <form
        className="flex items-center gap-2 mb-4"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(input);
        }}
      >
        <input
          type="search"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Search tasks + knowledge across every project…"
          aria-label="search query"
          className="flex-1 px-3 py-1.5 rounded-md text-sm border border-zinc-300 dark:border-zinc-700 bg-transparent"
        />
        <button
          type="submit"
          className="px-3 py-1.5 rounded-md text-sm bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700"
        >
          Search
        </button>
      </form>

      {health.conn === "disconnected" ? (
        // ADR-028 — unreachable is not the same fact as a failed query.
        // A 401 from a token-gated route used to report "Can't reach the
        // laptop API", which sent debugging in the wrong direction.
        <ErrorState variant="unreachable" description="Search is unavailable." />
      ) : search.isError ? (
        <ErrorState variant="failed" subject="search" />
      ) : query.trim().length === 0 ? (
        <p className="text-sm text-zinc-500">Type a term and hit Search.</p>
      ) : search.isLoading || !search.result ? (
        <p className="text-sm text-zinc-500">Searching…</p>
      ) : (
        <SearchResults
          result={search.result}
          onSelectHit={(h) =>
            navigate(
              `/graph?project=${encodeURIComponent(h.projectId)}&node=${encodeURIComponent(h.id)}`,
            )
          }
        />
      )}
    </section>
  );
}
