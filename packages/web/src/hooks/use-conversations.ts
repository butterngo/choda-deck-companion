// TASK-1570 — polls /conversations for the list, fetches one on demand for the
// detail pane. Same cadence and shape as use-knowledge.

import { useQuery } from "@tanstack/react-query";
import {
  fetchConversation,
  fetchConversations,
  type ConversationDetail,
  type ConversationSummary,
} from "../api";
import { HEALTH_POLL_MS } from "./use-health";

export interface ConversationListView {
  conversations: ConversationSummary[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useConversationList(): ConversationListView {
  const q = useQuery({
    queryKey: ["conversations", "list"],
    queryFn: ({ signal }) => fetchConversations(signal),
    refetchInterval: HEALTH_POLL_MS,
    staleTime: 0,
  });
  return {
    conversations: q.data?.conversations ?? [],
    isLoading: q.isLoading,
    isError: q.isError,
    refetch: () => void q.refetch(),
  };
}

export interface ConversationDetailView {
  detail: ConversationDetail | undefined;
  isLoading: boolean;
  isError: boolean;
  /** TASK-2550 — re-read the thread after a decide or signoff. */
  refetch: () => void;
}

export function useConversation(id: string | null): ConversationDetailView {
  const q = useQuery({
    queryKey: ["conversations", "detail", id],
    queryFn: ({ signal }) => fetchConversation(id as string, signal),
    enabled: id !== null,
    // TASK-2556 — poll like the list: a signoff or decision made elsewhere (MCP,
    // another session) otherwise left the pane `open` until a reload.
    refetchInterval: HEALTH_POLL_MS,
    staleTime: 0,
  });
  return {
    detail: q.data,
    isLoading: q.isLoading,
    isError: q.isError,
    refetch: () => void q.refetch(),
  };
}
