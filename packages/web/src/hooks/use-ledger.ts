// TASK-1160 — polls /sync/ledger for the Observatory. Same cadence as health so
// the two strips move together. Exposes a refetch so a Pull/Push can refresh the
// ledger the moment it completes.

import { useQuery } from "@tanstack/react-query";
import { fetchLedger, type LedgerRow } from "../api";
import { HEALTH_POLL_MS } from "./use-health";

export interface LedgerView {
  rows: LedgerRow[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useLedger(): LedgerView {
  const q = useQuery({
    queryKey: ["sync", "ledger"],
    queryFn: ({ signal }) => fetchLedger(signal),
    refetchInterval: HEALTH_POLL_MS,
    staleTime: 0,
  });
  return {
    rows: q.data?.ledger ?? [],
    isLoading: q.isLoading,
    isError: q.isError,
    refetch: () => void q.refetch(),
  };
}
