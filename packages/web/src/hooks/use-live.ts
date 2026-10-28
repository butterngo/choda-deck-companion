// TASK-2861 — the Runs screen's Live section polls the running agents and the
// processes of each workspace with a running run, every 15 s while the screen
// is open. react-query stops a query's interval when its last observer
// unmounts, so leaving the screen stops the polling.

import { useQueries, useQuery } from "@tanstack/react-query";
import { fetchAgents, fetchProcesses, type AgentsPayload, type ProcessesPayload } from "../api";

export const LIVE_POLL_MS = 15_000;

export function useAgents(): { data: AgentsPayload | undefined; error: Error | null } {
  const q = useQuery({
    queryKey: ["live", "agents"],
    queryFn: ({ signal }) => fetchAgents(signal),
    refetchInterval: LIVE_POLL_MS,
    retry: false,
  });
  return { data: q.data, error: q.error };
}

export function useProcesses(
  workspaceIds: string[],
): { workspaceId: string; data: ProcessesPayload | undefined; error: Error | null }[] {
  const results = useQueries({
    queries: workspaceIds.map((id) => ({
      queryKey: ["live", "processes", id],
      queryFn: ({ signal }: { signal: AbortSignal }) => fetchProcesses(id, signal),
      refetchInterval: LIVE_POLL_MS,
      retry: false,
    })),
  });
  return workspaceIds.map((workspaceId, i) => ({
    workspaceId,
    data: results[i]?.data,
    error: results[i]?.error ?? null,
  }));
}
