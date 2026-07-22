// TASK-1173 AC-2 — inbox triage list. GET /inbox returns every project's inbox
// (no workspaceId filter on the adapter yet), so this filters client-side to the
// focus project's raw/ready items — project-level, not true workspace-level,
// scoping. See api.ts's fetchInbox comment for the gap.

import { useQuery } from "@tanstack/react-query";
import { fetchInbox, type InboxItem } from "../api";
import { HEALTH_POLL_MS } from "./use-health";

export interface InboxView {
  items: InboxItem[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useInbox(projectId: string | null): InboxView {
  const q = useQuery({
    queryKey: ["inbox", "all"],
    queryFn: ({ signal }) => fetchInbox(signal),
    refetchInterval: HEALTH_POLL_MS,
    staleTime: 0,
  });
  const items = (q.data?.inbox ?? []).filter(
    (i) => (i.status === "raw" || i.status === "ready") && (projectId === null || i.projectId === projectId),
  );
  return {
    items,
    isLoading: q.isLoading,
    isError: q.isError,
    refetch: () => void q.refetch(),
  };
}
