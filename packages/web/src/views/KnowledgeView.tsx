// TASK-1174 — the Knowledgebase browser: list/filter + search + detail (body,
// staleness, linked edges), over the same single laptop API as the rest of the
// shell. Honest liveness (AC-5): reuses the shell's health context, same
// disconnected/stale treatment as Sync Observatory.
//
// TASK-1602 — search results now REPLACE the entry list rather than stacking
// above it. The view owns the search result so it can make that swap; the box
// is just an input.

import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import type { HealthView } from "../hooks/use-health";
import type { KnowledgeType } from "../api";
import { useKnowledgeList, useKnowledgeEntry } from "../hooks/use-knowledge";
import { useKnowledgeSearch } from "../hooks/use-knowledge-search";
import { KnowledgeList } from "../components/KnowledgeList";
import { KnowledgeResults } from "../components/KnowledgeResults";
import { KnowledgeDetail } from "../components/KnowledgeDetail";
import { KnowledgeSearchBox } from "../components/KnowledgeSearchBox";
import { ErrorState } from "../components/state/ErrorState";
import { EmptyState } from "../components/state/EmptyState";
import { CapabilityNote } from "../components/state/CapabilityNote";
import { Skeleton } from "../components/state/Skeleton";

export function KnowledgeView(): React.JSX.Element {
  const health = useOutletContext<HealthView>();
  const [selectedType, setSelectedType] = useState<KnowledgeType | null>(null);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const list = useKnowledgeList(selectedType);
  const detail = useKnowledgeEntry(selectedSlug);
  const search = useKnowledgeSearch();

  // A result the server could serve. `enabled: false` is a capability gap and
  // deliberately does NOT put the pane into results mode — the entry list has
  // to stay usable underneath the note explaining why search is off.
  const inResults = search.result?.enabled === true && submitted.length > 0;

  const runSearch = (): void => {
    const q = query.trim();
    if (q.length === 0) {
      clearSearch();
      return;
    }
    setSubmitted(q);
    search.search(q);
  };

  const clearSearch = (): void => {
    setQuery("");
    setSubmitted("");
    search.search("");
  };

  function listPane(): React.JSX.Element {
    if (list.isLoading) return <Skeleton shape="list" label="Loading entries…" />;

    if (inResults) {
      const hits = search.result?.results ?? [];
      return (
        <>
          <div className="flex items-center gap-2 pb-2 text-[11px] text-zinc-400">
            <span className="tabular-nums">
              {hits.length === 0 ? "No results" : `${hits.length} result${hits.length === 1 ? "" : "s"}`} for “{submitted}”
            </span>
            <span className="flex-1" />
            <button
              type="button"
              onClick={clearSearch}
              className="text-blue-600 dark:text-blue-400 hover:underline"
            >
              Back to all entries
            </button>
          </div>
          <div
            data-testid="knowledge-list-pane"
            className="max-h-[calc(100vh-18rem)] overflow-y-auto pr-1"
          >
            {hits.length === 0 ? (
              <EmptyState
                icon="ti-search"
                title={`No entries match “${submitted}”`}
                description="Search covers titles and bodies. Try a shorter term, or browse by type."
                action={
                  <button
                    type="button"
                    onClick={clearSearch}
                    className="px-3 py-1.5 rounded-md text-sm border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  >
                    Clear search
                  </button>
                }
              />
            ) : (
              <KnowledgeResults hits={hits} selectedSlug={selectedSlug} onSelect={setSelectedSlug} />
            )}
          </div>
        </>
      );
    }

    return (
      <div
        data-testid="knowledge-list-pane"
        className="max-h-[calc(100vh-18rem)] overflow-y-auto pr-1"
      >
        <KnowledgeList
          entries={list.entries}
          selectedType={selectedType}
          onSelectType={setSelectedType}
          selectedSlug={selectedSlug}
          onSelect={setSelectedSlug}
        />
      </div>
    );
  }

  function body(): React.JSX.Element {
    if (health.conn === "disconnected") {
      // ADR-028 — unreachable is not the same fact as a failed query.
      return (
        <ErrorState
          variant="unreachable"
          description="The knowledgebase is unavailable — this is not an empty store."
        />
      );
    }
    if (list.isError) return <ErrorState variant="failed" subject="the knowledgebase" />;

    return (
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(240px,320px)_1fr] gap-6">
        <div className="min-w-0">
          <KnowledgeSearchBox
            query={query}
            onQueryChange={setQuery}
            onSubmit={runSearch}
            onClear={clearSearch}
            isSearching={search.isSearching}
            hasResult={submitted.length > 0}
          />

          {search.isError && (
            <p role="alert" className="mb-2 text-xs text-rose-700 dark:text-rose-400">
              Search failed — try again.
            </p>
          )}
          {/* A switched-off provider is a capability gap, not a failure: the
              note sits ABOVE a still-usable entry list rather than replacing
              it. */}
          {search.result && !search.result.enabled && (
            <div className="mb-2">
              <CapabilityNote>
                Search is off on the server
                {search.result.reason ? `: ${search.result.reason}` : "."} Browsing by type still
                works.
              </CapabilityNote>
            </div>
          )}

          {listPane()}

          {health.conn === "stale" && (
            <p className="mt-3 text-xs text-zinc-400">Possibly stale — see the status bar.</p>
          )}
        </div>

        <div
          data-testid="knowledge-detail-pane"
          className="min-w-0 max-h-[calc(100vh-14rem)] overflow-y-auto"
        >
          {selectedSlug === null ? (
            <EmptyState
              icon="ti-book-2"
              title="No entry selected"
              description="Pick an entry on the left to read it, with its staleness and linked edges."
            />
          ) : detail.isError ? (
            <ErrorState variant="failed" subject={selectedSlug} />
          ) : detail.isLoading || !detail.entry ? (
            <Skeleton shape="text" label="Loading entry…" />
          ) : (
            <KnowledgeDetail entry={detail.entry} />
          )}
        </div>
      </div>
    );
  }

  return (
    <section aria-label="knowledgebase">
      <h1 className="text-lg font-medium mb-4">Choda knowledge</h1>
      {body()}
    </section>
  );
}
