// TASK-1444 — the Graph pillar: a visual force-directed knowledge graph over the
// full-graph read (TASK-1443), for the project behind the selected workspace.
// Honest liveness (AC-5): reuses the shell's health context, same
// disconnected/stale treatment as Sync / Cockpit / Knowledge — never a
// fake-live graph when the API is down.

import { useOutletContext, useSearchParams } from "react-router-dom";
import type { HealthView } from "../hooks/use-health";
import { useWorkspace } from "../hooks/use-workspace";
import { useWorkspaces } from "../hooks/use-workspaces";
import { useFullGraph } from "../hooks/use-graph";
import { GraphView } from "../components/GraphView";
import { WorkspaceSelect } from "../components/WorkspaceSelect";

export function GraphboardView(): React.JSX.Element {
  const health = useOutletContext<HealthView>();
  const [searchParams] = useSearchParams();
  const { workspaceId, setWorkspaceId } = useWorkspace();
  const { workspaces } = useWorkspaces();
  // Search deep-links here with ?project=&node= to open a specific node's graph
  // (TASK-1493 → Graph). An explicit project query wins over the workspace pick
  // so a search hit lands even before a workspace is chosen.
  const projectFromQuery = searchParams.get("project");
  const focusNode = searchParams.get("node");
  const projectId =
    projectFromQuery ?? workspaces.find((w) => w.id === workspaceId)?.projectId ?? null;
  const graph = useFullGraph(projectId);

  return (
    <section aria-label="knowledge graph">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-lg font-medium">Knowledge Graph</h1>
        {projectId && <span className="text-xs text-zinc-400">project: {projectId}</span>}
      </div>

      {workspaceId === null && !projectFromQuery ? (
        <WorkspaceSelect onSubmit={setWorkspaceId} />
      ) : health.conn === "disconnected" || graph.isError ? (
        <p role="alert" className="text-sm text-rose-700 dark:text-rose-400">
          Can’t reach the laptop API — the graph is unavailable. (Not “empty graph”.)
        </p>
      ) : projectId === null || graph.isLoading || !graph.data ? (
        <p className="text-sm text-zinc-500">Loading graph…</p>
      ) : (
        <>
          <GraphView nodes={graph.data.nodes} edges={graph.data.edges} focusNode={focusNode} />
          {health.conn === "stale" && (
            <p className="mt-3 text-xs text-zinc-400">Possibly stale — see the status bar.</p>
          )}
        </>
      )}
    </section>
  );
}
