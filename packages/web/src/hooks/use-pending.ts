// TASK-2381 — GET /inbox/pending for the decide screen, the sidebar badge and
// the landing redirect. One query key, so all three agree on the count. Polled
// once a minute: the digest writes at 09:00 and an improve run can file at any
// time, and a badge that only updates on reload is a badge nobody trusts.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { archivePending, convertPending, fetchPending, type PendingItem } from "../api";

export const PENDING_KEY = ["inbox-pending"] as const;

export interface PendingState {
  items: PendingItem[];
  isLoading: boolean;
  isError: boolean;
}

export function usePending(): PendingState {
  const q = useQuery({
    queryKey: PENDING_KEY,
    queryFn: ({ signal }) => fetchPending(signal),
    refetchInterval: 60_000,
  });
  return { items: q.data ?? [], isLoading: q.isLoading, isError: q.isError };
}

export function usePendingActions() {
  const qc = useQueryClient();
  const refresh = (): Promise<void> => qc.invalidateQueries({ queryKey: PENDING_KEY });
  return {
    convert: useMutation({ mutationFn: (id: string) => convertPending(id), onSuccess: refresh }),
    archive: useMutation({
      mutationFn: ({ id, reason }: { id: string; reason: string }) => archivePending(id, reason),
      onSuccess: refresh,
    }),
  };
}
