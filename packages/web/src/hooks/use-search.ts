// TASK-1493 — cross-project search over GET /search. Debounced by the caller
// (SearchView passes the committed query); disabled until a non-empty query so
// an empty box never hammers the adapter.

import { useQuery } from "@tanstack/react-query";
import { fetchSearch, type SearchResult } from "../api";

export interface SearchView {
  result: SearchResult | null;
  isLoading: boolean;
  isError: boolean;
}

export function useSearch(query: string): SearchView {
  const q = query.trim();
  const r = useQuery({
    queryKey: ["search", q],
    queryFn: ({ signal }) => fetchSearch(q, signal),
    enabled: q.length > 0,
    staleTime: 5_000,
  });
  return {
    result: r.data ?? null,
    isLoading: r.isLoading,
    isError: r.isError,
  };
}
