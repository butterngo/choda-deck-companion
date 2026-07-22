// TASK-1174 AC-3 — search is user-triggered (not polled): the box calls this on
// submit and holds the last result. Degrades gracefully — a disabled provider
// comes back as {enabled:false, results:[]}, never an error state.

import { useState } from "react";
import { searchKnowledgeEntries, type KnowledgeSearchResult } from "../api";

export interface KnowledgeSearchView {
  result: KnowledgeSearchResult | null;
  isSearching: boolean;
  isError: boolean;
  search: (query: string) => void;
}

export function useKnowledgeSearch(): KnowledgeSearchView {
  const [result, setResult] = useState<KnowledgeSearchResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isError, setIsError] = useState(false);

  const search = (query: string): void => {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      setResult(null);
      setIsError(false);
      return;
    }
    setIsSearching(true);
    setIsError(false);
    searchKnowledgeEntries(trimmed)
      .then((r) => setResult(r))
      .catch(() => setIsError(true))
      .finally(() => setIsSearching(false));
  };

  return { result, isSearching, isError, search };
}
