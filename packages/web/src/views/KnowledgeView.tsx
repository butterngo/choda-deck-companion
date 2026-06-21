// TASK-1159 — Knowledge pillar placeholder. The Knowledgebase browser (ADRs /
// features + staleness + graph) lands in TASK-1174.

export function KnowledgeView(): React.JSX.Element {
  return (
    <section aria-label="knowledgebase">
      <h1 className="text-lg font-medium mb-1">Knowledgebase</h1>
      <p className="text-sm text-zinc-500">
        Browse ADRs / features, staleness, and the task↔ADR↔conversation graph — TASK-1174.
      </p>
    </section>
  );
}
