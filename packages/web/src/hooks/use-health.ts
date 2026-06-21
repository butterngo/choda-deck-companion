// TASK-1159 — polls /sync/health and derives the shell's liveness verdict.
// Honest liveness (AC-3 + AC-4): the hook distinguishes three states the status
// bar must render differently — connected (fresh), disconnected (API unreachable
// / errored), and stale (last successful fetch older than the poll interval, so
// the data on screen may no longer reflect reality).

import { useQuery } from "@tanstack/react-query";
import { fetchHealth, type SyncHealth } from "../api";

export const HEALTH_POLL_MS = 10_000;
// Past this age since the last good fetch, treat the view as stale rather than
// live — one missed poll plus a small grace margin.
export const STALE_AFTER_MS = HEALTH_POLL_MS * 2;

export type ConnState = "connected" | "stale" | "disconnected";

export interface HealthView {
  health: SyncHealth | null;
  conn: ConnState;
  lastFetchedAgoSec: number | null;
}

export function deriveConn(
  isError: boolean,
  hasData: boolean,
  ageMs: number | null,
  nowMs: number,
): ConnState {
  if (isError || !hasData) return "disconnected";
  if (ageMs !== null && nowMs - ageMs > STALE_AFTER_MS) return "stale";
  return "connected";
}

export function useHealth(nowMs: number = Date.now()): HealthView {
  const q = useQuery({
    queryKey: ["sync", "health"],
    queryFn: ({ signal }) => fetchHealth(signal),
    refetchInterval: HEALTH_POLL_MS,
    staleTime: 0,
  });
  const hasData = q.data !== undefined;
  const ageMs = q.dataUpdatedAt > 0 ? q.dataUpdatedAt : null;
  const conn = deriveConn(q.isError, hasData, ageMs, nowMs);
  return {
    health: q.data ?? null,
    conn,
    lastFetchedAgoSec: ageMs !== null ? Math.max(0, Math.round((nowMs - ageMs) / 1000)) : null,
  };
}
