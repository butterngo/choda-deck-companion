// TASK-1465 — polls GET /workspaces for the workspace dropdown. Same
// cadence as the other pillar screens.

import { useQuery } from "@tanstack/react-query";
import { fetchWorkspaces, type Workspace } from "../api";
import { HEALTH_POLL_MS } from "./use-health";

export interface WorkspacesView {
  workspaces: Workspace[];
  isLoading: boolean;
  isError: boolean;
}

export function useWorkspaces(): WorkspacesView {
  const q = useQuery({
    queryKey: ["workspaces"],
    queryFn: ({ signal }) => fetchWorkspaces(signal),
    refetchInterval: HEALTH_POLL_MS,
    staleTime: 0,
  });
  return {
    workspaces: q.data?.workspaces ?? [],
    isLoading: q.isLoading,
    isError: q.isError,
  };
}
