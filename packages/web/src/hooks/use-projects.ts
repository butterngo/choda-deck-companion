// TASK-1765 — GET /projects for the browse hierarchy, plus the projectId
// grouping the adapter does not do for us.
//
// /projects returns flat projects; /workspaces returns every workspace tagged
// with its projectId. Grouping here rather than per-project fetching keeps it
// to two requests total regardless of how many projects exist.

import { useQuery } from "@tanstack/react-query";
import { fetchProjects, type Project, type Workspace } from "../api";
import { HEALTH_POLL_MS } from "./use-health";
import { useWorkspaces } from "./use-workspaces";

export interface ProjectsView {
  projects: Project[];
  isLoading: boolean;
  isError: boolean;
  /** Workspaces of one project, newest-registered order preserved from the API. */
  workspacesOf: (projectId: string) => Workspace[];
  /** Live (non-archived) count, for the row's own summary. */
  liveCountOf: (projectId: string) => number;
}

// Exported as pure functions, following use-health's `deriveConn`: the grouping
// and counting rules are the whole substance of this hook, and a test that
// mocked the hook would have to reimplement them to stand in for it — which
// proves nothing about the real thing. Learned the hard way here: mocking
// use-projects left both rules completely uncovered while 237 tests stayed green.
export function workspacesForProject(all: Workspace[], projectId: string): Workspace[] {
  return all.filter((w) => w.projectId === projectId);
}

// Archived workspaces are still LISTED (hiding them would misreport what is
// registered) but never COUNTED, because a count is a claim about what is usable.
export function liveWorkspaceCount(all: Workspace[], projectId: string): number {
  return workspacesForProject(all, projectId).filter((w) => w.archivedAt === null).length;
}

export function useProjects(): ProjectsView {
  const q = useQuery({
    queryKey: ["projects"],
    queryFn: ({ signal }) => fetchProjects(signal),
    refetchInterval: HEALTH_POLL_MS,
    staleTime: 0,
  });
  const ws = useWorkspaces();

  const workspacesOf = (projectId: string): Workspace[] =>
    workspacesForProject(ws.workspaces, projectId);

  const liveCountOf = (projectId: string): number =>
    liveWorkspaceCount(ws.workspaces, projectId);

  return {
    projects: q.data?.projects ?? [],
    // Either half missing leaves the screen unable to answer "which workspaces",
    // so both feed the loading/error state rather than only /projects.
    isLoading: q.isLoading || ws.isLoading,
    isError: q.isError || ws.isError,
    workspacesOf,
    liveCountOf,
  };
}
