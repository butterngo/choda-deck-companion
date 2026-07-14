// TASK-1215 — polls /sync/log for the SyncLog feed (TASK-1216). Same cadence as
// health/ledger so the Observatory strips move together. Exposes refetch so a
// Pull/Push can refresh the feed the moment it completes.

import { useQuery } from "@tanstack/react-query";
import { fetchSyncLog, type SyncEvent } from "../api";
import { HEALTH_POLL_MS } from "./use-health";

export interface SyncLogView {
  events: SyncEvent[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useSyncLog(limit?: number): SyncLogView {
  const q = useQuery({
    queryKey: ["sync", "log", limit ?? null],
    queryFn: ({ signal }) => fetchSyncLog(limit, signal),
    refetchInterval: HEALTH_POLL_MS,
    staleTime: 0,
  });
  return {
    events: q.data?.events ?? [],
    isLoading: q.isLoading,
    isError: q.isError,
    refetch: () => void q.refetch(),
  };
}
