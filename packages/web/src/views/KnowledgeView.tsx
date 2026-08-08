// TASK-1174 — the Knowledgebase browser: list/filter + search + detail (body,
// staleness, linked edges), over the same single laptop API as the rest of the
// shell. Honest liveness (AC-5): reuses the shell's health context, same
// disconnected/stale treatment as Sync Observatory.

import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import type { HealthView } from "../hooks/use-health";
import type { KnowledgeType } from "../api";
import { useKnowledgeList, useKnowledgeEntry } from "../hooks/use-knowledge";
import { KnowledgeList } from "../components/KnowledgeList";
import { KnowledgeDetail } from "../components/KnowledgeDetail";
import { KnowledgeSearchBox } from "../components/KnowledgeSearchBox";
import { ErrorState } from "../components/state/ErrorState";

export function KnowledgeView(): React.JSX.Element {
  const health = useOutletContext<HealthView>();
  const [selectedType, setSelectedType] = useState<KnowledgeType | null>(null);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const list = useKnowledgeList(selectedType);
  const detail = useKnowledgeEntry(selectedSlug);

  return (
    <section aria-label="knowledgebase">
      <h1 className="text-lg font-medium mb-3">Knowledgebase</h1>

      {health.conn === "disconnected" ? (
        // ADR-028 — unreachable is not the same fact as a failed query.
        // A 401 from a token-gated route used to report "Can't reach the
        // laptop API", which sent debugging in the wrong direction.
        <ErrorState variant="unreachable" description="The knowledgebase is unavailable — this is not an empty store." />
      ) : list.isError ? (
        <ErrorState variant="failed" subject="the knowledgebase" />
      ) : (
        // TASK-1614 — the detail is the point; the list is navigation. A 50/50
        // split gave a list of titles the same room as the document you came to
        // read. The list is bounded to 240–320px so the detail takes the rest,
        // and the whole thing stacks below `lg` where there is no room to split.
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(240px,320px)_1fr] gap-6">
          <div>
            <KnowledgeSearchBox onSelect={setSelectedSlug} />
            {list.isLoading ? (
              <p className="text-sm text-zinc-500">Loading entries…</p>
            ) : (
              // TASK-1574 — same bounded pane as ConversationsView. The filter
              // and search box masked this, but the underlying layout is
              // identical: unbounded, the entry list made the page ~17,000px
              // tall and pushed the detail out of the viewport.
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
            )}
            {health.conn === "stale" && (
              <p className="mt-3 text-xs text-zinc-400">Possibly stale — see the status bar.</p>
            )}
          </div>
          <div
            data-testid="knowledge-detail-pane"
            className="max-h-[calc(100vh-14rem)] overflow-y-auto"
          >
            {selectedSlug === null ? (
              <p className="text-sm text-zinc-500">Select an entry to view its detail.</p>
            ) : detail.isError ? (
              <p role="alert" className="text-sm text-rose-700 dark:text-rose-400">
                Couldn’t load {selectedSlug}.
              </p>
            ) : detail.isLoading || !detail.entry ? (
              <p className="text-sm text-zinc-500">Loading…</p>
            ) : (
              <KnowledgeDetail entry={detail.entry} />
            )}
          </div>
        </div>
      )}
    </section>
  );
}
