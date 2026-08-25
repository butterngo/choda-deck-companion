// TASK-1444 — the Graph pillar: a visual force-directed knowledge graph over the
// full-graph read (TASK-1443), for the project behind the selected workspace.
// Honest liveness (AC-5): reuses the shell's health context, same
// disconnected/stale treatment as Sync / Knowledge — never a
// fake-live graph when the API is down.

import { useMemo, useState } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import type { HealthView } from "../hooks/use-health";
import { useWorkspace } from "../hooks/use-workspace";
import { useWorkspaces } from "../hooks/use-workspaces";
import { useFullGraph } from "../hooks/use-graph";
import { useKnowledgeSearch } from "../hooks/use-knowledge-search";
import { GraphView } from "../components/GraphView";
import { WorkspaceSelect } from "../components/WorkspaceSelect";
import { NodeDetailDrawer, type NodeRef } from "../components/NodeDetailDrawer";
import { ErrorState } from "../components/state/ErrorState";
import { Skeleton } from "../components/state/Skeleton";
import { EmptyState } from "../components/state/EmptyState";
import { CapabilityNote } from "../components/state/CapabilityNote";

export function GraphboardView(): React.JSX.Element {
  const health = useOutletContext<HealthView>();
  const [searchParams] = useSearchParams();
  const [detailNode, setDetailNode] = useState<NodeRef | null>(null);
  const { workspaceId, setWorkspaceId } = useWorkspace();
  const { workspaces } = useWorkspaces();

  // TASK-1445 — knowledge search highlights matching graph nodes in place.
  // Reuses useKnowledgeSearch verbatim, so the disabled-provider degrade path is
  // identical to KnowledgeSearchBox (AC-3): a disabled search shows a reason and
  // highlights nothing, never an error state.
  const [query, setQuery] = useState("");
  const { result: searchResult, isSearching, isError, search } = useKnowledgeSearch();
  // null → no active search (render normally); a Set → highlight these ids.
  // A disabled provider yields null (degrade, don't dim); an enabled zero-match
  // query yields an empty Set so any prior highlight is cleared (AC-5).
  const matchIds = useMemo(
    () =>
      searchResult && searchResult.enabled
        ? new Set(searchResult.results.map((r) => r.slug))
        : null,
    [searchResult],
  );
  const clearSearch = (): void => {
    setQuery("");
    search("");
  };
  // Search deep-links here with ?project=&node= to open a specific node's graph
  // (TASK-1493 → Graph). An explicit project query wins over the workspace pick
  // so a search hit lands even before a workspace is chosen.
  const projectFromQuery = searchParams.get("project");
  const focusNode = searchParams.get("node");
  const projectId =
    projectFromQuery ?? workspaces.find((w) => w.id === workspaceId)?.projectId ?? null;
  const graph = useFullGraph(projectId);

  return (
    <section aria-label="knowledge graph" className="flex-1 min-h-0 flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-lg font-medium">Knowledge Graph</h1>
        {projectId && <span className="text-xs text-zinc-400">project: {projectId}</span>}
      </div>

      {workspaceId === null && !projectFromQuery ? (
        <WorkspaceSelect onSubmit={setWorkspaceId} />
      ) : health.conn === "disconnected" ? (
        // ADR-028 — unreachable is not the same fact as a failed query.
        // A 401 from a token-gated route used to report "Can't reach the
        // laptop API", which sent debugging in the wrong direction.
        <ErrorState variant="unreachable" description="The graph is unavailable — this is not an empty graph." />
      ) : graph.isError ? (
        <ErrorState variant="failed" subject="the graph" />
      ) : projectId === null || graph.isLoading || !graph.data ? (
        <Skeleton shape="card" label="Loading graph…" />
      ) : (
        <>
          <form
            className="mb-3 flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              search(query);
            }}
          >
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Highlight nodes matching…"
              aria-label="highlight graph nodes"
              className="px-2 py-1.5 rounded-md text-sm border border-zinc-300 dark:border-zinc-700 bg-transparent flex-1"
            />
            <button
              type="submit"
              disabled={isSearching}
              className="px-3 py-1.5 rounded-md text-sm bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-50"
            >
              Highlight
            </button>
            {matchIds !== null && (
              <button
                type="button"
                onClick={clearSearch}
                className="px-3 py-1.5 rounded-md text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200"
              >
                Clear
              </button>
            )}
          </form>
          {isError && (
            <p role="alert" className="mb-2 text-sm text-rose-700 dark:text-rose-400">
              Search failed — try again.
            </p>
          )}
          {searchResult && !searchResult.enabled && (
            // A switched-off provider is a gap, not a failure — CapabilityNote is
            // neutral zinc and sits above the graph, which keeps rendering.
            <div className="mb-2">
              <CapabilityNote>
                Search is disabled server-side{searchResult.reason ? `: ${searchResult.reason}` : "."}
              </CapabilityNote>
            </div>
          )}
          {matchIds !== null && searchResult?.enabled && (
            // An inline outcome line above a graph that keeps rendering — not a
            // pane-sized empty state (the FocusBoard call from TASK-1596).
            <p role="status" className="mb-2 text-sm text-zinc-500">
              {matchIds.size === 0
                ? "No matches — nothing highlighted."
                : `Highlighting ${matchIds.size} matching node${matchIds.size === 1 ? "" : "s"}.`}
            </p>
          )}
          {graph.data.nodes.length === 0 ? (
            // Reached the API and it answered with nothing — distinct from the
            // unreachable branch above, which must never read as "empty".
            <EmptyState
              icon="ti-affiliate"
              title="No nodes in this graph"
              description={`Nothing is recorded for ${projectId} yet — tasks and knowledge entries appear here once they exist.`}
            />
          ) : (
            <GraphView
              nodes={graph.data.nodes}
              edges={graph.data.edges}
              focusNode={focusNode}
              matchIds={matchIds}
              onOpenNode={(id, type) => setDetailNode({ id, type })}
            />
          )}
          {health.conn === "stale" && (
            <p className="mt-3 text-xs text-zinc-400">Possibly stale — see the status bar.</p>
          )}
        </>
      )}

      {detailNode && <NodeDetailDrawer node={detailNode} onClose={() => setDetailNode(null)} />}
    </section>
  );
}
