// TASK-1173 — polls /workflow/focus for the Cockpit board. Same cadence as the
// other pillar screens so the strips move together. Disabled until a
// workspaceId is known (see use-workspace.ts) — never fetches with an empty id.

import { useQuery } from "@tanstack/react-query";
import { fetchFocus, type FocusFeed } from "../api";
import { HEALTH_POLL_MS } from "./use-health";

export interface FocusView {
  feed: FocusFeed | null;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useFocus(workspaceId: string | null): FocusView {
  const q = useQuery({
    queryKey: ["workflow", "focus", workspaceId],
    queryFn: ({ signal }) => fetchFocus(workspaceId as string, signal),
    enabled: workspaceId !== null && workspaceId.length > 0,
    refetchInterval: HEALTH_POLL_MS,
    staleTime: 0,
  });
  return {
    feed: q.data ?? null,
    isLoading: q.isLoading,
    isError: q.isError,
    refetch: () => void q.refetch(),
  };
}
