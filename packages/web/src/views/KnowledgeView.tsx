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

export function KnowledgeView(): React.JSX.Element {
  const health = useOutletContext<HealthView>();
  const [selectedType, setSelectedType] = useState<KnowledgeType | null>(null);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const list = useKnowledgeList(selectedType);
  const detail = useKnowledgeEntry(selectedSlug);

  return (
    <section aria-label="knowledgebase">
      <h1 className="text-lg font-medium mb-3">Knowledgebase</h1>

      {health.conn === "disconnected" || list.isError ? (
        <p role="alert" className="text-sm text-rose-700 dark:text-rose-400">
          Can’t reach the laptop API — the knowledgebase is unavailable.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <KnowledgeSearchBox onSelect={setSelectedSlug} />
            {list.isLoading ? (
              <p className="text-sm text-zinc-500">Loading entries…</p>
            ) : (
              <KnowledgeList
                entries={list.entries}
                selectedType={selectedType}
                onSelectType={setSelectedType}
                selectedSlug={selectedSlug}
                onSelect={setSelectedSlug}
              />
            )}
            {health.conn === "stale" && (
              <p className="mt-3 text-xs text-zinc-400">Possibly stale — see the status bar.</p>
            )}
          </div>
          <div>
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
