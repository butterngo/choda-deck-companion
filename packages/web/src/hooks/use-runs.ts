// TASK-2532 — GET /runs for the Runs screen. Polled once a minute, like the
// decide screen: a run moves an item every few minutes and a screen that only
// updates on reload is one nobody trusts.

import { useQuery } from "@tanstack/react-query";
import { fetchRuns, type RunsPayload } from "../api";

export const RUNS_KEY = ["runs"] as const;

export interface RunsState {
  data: RunsPayload | undefined;
  isLoading: boolean;
  isError: boolean;
}

export function useRuns(): RunsState {
  const q = useQuery({
    queryKey: RUNS_KEY,
    queryFn: ({ signal }) => fetchRuns(signal),
    refetchInterval: 60_000,
  });
  return { data: q.data, isLoading: q.isLoading, isError: q.isError };
}
