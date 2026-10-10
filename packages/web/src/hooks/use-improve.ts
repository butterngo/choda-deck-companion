// TASK-2359 — GET /improve/:ws for the Improve tab, plus the writes it makes.
// Every write refetches the overview rather than patching the cache: the
// adapter owns the files (config, rejected.json, the inbox), so its answer is
// the only one worth showing.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  approveImproveProposal,
  fetchImprove,
  fetchImproveRun,
  rejectImproveProposal,
  saveImproveConfig,
  startImproveRun,
  type ImproveConfig,
  type ImproveOverview,
  type ImproveRun,
} from "../api";

export const improveKey = (ws: string): readonly unknown[] => ["improve", ws];

export interface ImproveState {
  overview: ImproveOverview | null;
  isLoading: boolean;
  isError: boolean;
}

export function useImprove(ws: string | null): ImproveState {
  const q = useQuery({
    queryKey: improveKey(ws ?? ""),
    queryFn: ({ signal }) => fetchImprove(ws ?? "", signal),
    enabled: ws !== null,
  });
  return { overview: q.data ?? null, isLoading: q.isLoading, isError: q.isError };
}

export function useImproveActions(ws: string) {
  const qc = useQueryClient();
  const refresh = (): Promise<void> => qc.invalidateQueries({ queryKey: improveKey(ws) });
  return {
    saveConfig: useMutation({
      mutationFn: (config: ImproveConfig) => saveImproveConfig(ws, config),
      onSuccess: refresh,
    }),
    approve: useMutation({
      mutationFn: (inboxId: string) => approveImproveProposal(ws, inboxId),
      onSuccess: refresh,
    }),
    reject: useMutation({
      mutationFn: ({ inboxId, reason }: { inboxId: string; reason: string }) =>
        rejectImproveProposal(ws, inboxId, reason),
      onSuccess: refresh,
    }),
    run: useMutation({
      mutationFn: () => startImproveRun(ws),
      onSuccess: refresh,
    }),
  };
}

/** Polls one run every 2s until it has ended; then refreshes the overview once. */
export function useImproveRun(ws: string, runId: string | null): (ImproveRun & { log: string }) | null {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["improve-run", ws, runId],
    queryFn: async ({ signal }) => {
      const run = await fetchImproveRun(ws, runId ?? "", signal);
      if (run.endedAt !== null) void qc.invalidateQueries({ queryKey: improveKey(ws) });
      return run;
    },
    enabled: runId !== null,
    refetchInterval: (query) => (query.state.data?.endedAt ? false : 2000),
  });
  return q.data ?? null;
}
