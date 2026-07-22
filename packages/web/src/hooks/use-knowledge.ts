// TASK-1174 — polls /knowledge for the browser's list, and fetches one entry on
// demand for the detail view. Same cadence as the other pillar screens.

import { useQuery } from "@tanstack/react-query";
import { fetchKnowledgeEntry, fetchKnowledgeList, type KnowledgeEntry, type KnowledgeListItem, type KnowledgeType } from "../api";
import { HEALTH_POLL_MS } from "./use-health";

export interface KnowledgeListView {
  entries: KnowledgeListItem[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useKnowledgeList(type: KnowledgeType | null): KnowledgeListView {
  const q = useQuery({
    queryKey: ["knowledge", "list", type],
    queryFn: ({ signal }) => fetchKnowledgeList(type ?? undefined, signal),
    refetchInterval: HEALTH_POLL_MS,
    staleTime: 0,
  });
  return {
    entries: q.data?.entries ?? [],
    isLoading: q.isLoading,
    isError: q.isError,
    refetch: () => void q.refetch(),
  };
}

export interface KnowledgeEntryView {
  entry: KnowledgeEntry | null;
  isLoading: boolean;
  isError: boolean;
}

export function useKnowledgeEntry(slug: string | null): KnowledgeEntryView {
  const q = useQuery({
    queryKey: ["knowledge", "entry", slug],
    queryFn: ({ signal }) => fetchKnowledgeEntry(slug as string, signal),
    enabled: slug !== null,
    staleTime: 0,
  });
  return {
    entry: q.data ?? null,
    isLoading: q.isLoading,
    isError: q.isError,
  };
}
