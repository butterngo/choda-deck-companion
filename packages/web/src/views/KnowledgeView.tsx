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
          {/* "N results" was a lie. Search is semantic: it returns the top-K
              NEAREST entries by vector distance, with no relevance threshold,
              so a nonsense query still comes back with a full page. Verified
              live — `zzzqqqxyzzy` returned 5 "results" at distances 1.286-1.313
              (spread 0.027, the flat profile that `a-flat-distance-profile-from
              -knowledge-search-means-no-match` in this very store describes).
              Calling them "nearest" is true whatever the distances are.

              A relevance cutoff is NOT guessed here on purpose: the sibling
              gotcha `sweep-threshold-constants-against-real-fixtures` is about
              exactly this mistake. It needs a sweep against real queries. */}
          <div className="flex items-center gap-2 pb-2 text-[11px] text-zinc-400">
            <span
              className="tabular-nums"
              title="Semantic search returns the closest entries by meaning, not keyword matches — so it always returns some, however distant."
            >
              {hits.length === 0
                ? "Nothing returned"
                : `${hits.length} nearest to`}{" "}
              “{submitted}”
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
            className="flex-1 min-h-0 overflow-y-auto pr-1"
          >
            {hits.length === 0 ? (
              <EmptyState
                icon="ti-search"
                title={`Nothing returned for “${submitted}”`}
                // Kept as a guard, not as a state you will normally reach: with
                // `enabled: true` the provider always returns its top-K, so an
                // empty array means the store itself is empty or unembedded.
                description="Semantic search returns the closest entries by meaning, so an empty answer means nothing is indexed yet."
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
        className="flex-1 min-h-0 overflow-y-auto pr-1"
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
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(240px,320px)_1fr] gap-6 flex-1 min-h-0 lg:grid-rows-[minmax(0,1fr)]">
        {/* The grid item, not the pane. It has to be a flex column that can
            shrink, or the pane inside it grows to content and its own
            overflow-y-auto never engages — measured at 19069px tall before
            this was added. */}
        <div className="min-w-0 min-h-0 flex flex-col">
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
          className="min-w-0 min-h-0 overflow-y-auto"
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
    <section aria-label="knowledgebase" className="flex-1 min-h-0 flex flex-col">
      <h1 className="text-lg font-medium mb-4">Choda knowledge</h1>
      {body()}
    </section>
  );
}
