// TASK-1798 — resolve one symbol to its declarations.
//
// Keyed by (workspace, name) and cached, because a reader following a chain
// tends to click the same handful of names repeatedly, and the answer for a
// given name does not change while they read.

import { useQuery } from "@tanstack/react-query";
import { fetchWorkspaceSymbols, type SymbolMatch } from "../api";

export interface SymbolLookupView {
  /** The name being resolved, or null when nothing is pending. */
  name: string | null;
  matches: SymbolMatch[];
  isLoading: boolean;
  isError: boolean;
  /** True once a lookup has actually answered — not merely "matches is empty". */
  isResolved: boolean;
}

export function useWorkspaceSymbols(
  workspaceId: string | null,
  name: string | null,
): SymbolLookupView {
  const q = useQuery({
    queryKey: ["workspace-symbols", workspaceId, name],
    queryFn: ({ signal }) => fetchWorkspaceSymbols(workspaceId as string, name as string, signal),
    enabled: workspaceId !== null && name !== null,
    // A declaration does not move while the reader is reading. Re-asking on
    // every focus change would spend a filesystem scan to learn nothing.
    staleTime: 60_000,
    retry: false,
  });

  return {
    name,
    matches: q.data?.matches ?? [],
    isLoading: q.isLoading && name !== null,
    isError: q.isError,
    // Distinguishes "answered with nothing" from "has not answered yet". The
    // sibling task renders those two differently, and collapsing them here
    // would make that impossible downstream.
    isResolved: q.data !== undefined,
  };
}
