// TASK-1798/1799 — resolve one symbol to its declarations.
//
// Keyed by (workspace, name) and cached, because a reader following a chain
// tends to click the same handful of names repeatedly, and the answer for a
// given name does not change while they read.
//
// TASK-1799 — the failures are reported through their OWN fields rather than a
// shared `isError`. There are three of them and they mean opposite things to a
// reader: your app is behind, that workspace does not exist, the lookup broke.
// A caller branching on `isError` would render one message for all three, which
// is how "no definition found" ends up on screen when the truth is that the
// route was never deployed.

import { useQuery } from "@tanstack/react-query";
import {
  AdapterRouteMissingError,
  fetchWorkspaceSymbols,
  UnknownWorkspaceError,
  type SymbolMatch,
} from "../api";

export interface SymbolLookupView {
  /** The name being resolved, or null when nothing is pending. */
  name: string | null;
  matches: SymbolMatch[];
  isLoading: boolean;
  /** A genuine failure — NOT one of the two diagnosed 404s below. */
  isError: boolean;
  /** True once a lookup has actually answered — not merely "matches is empty". */
  isResolved: boolean;
  /** TASK-1799 — the adapter predates this route (INBOX-1888). */
  routeMissing: boolean;
  /** TASK-1799 — the route exists; the workspace does not. */
  unknownWorkspace: boolean;
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

  const routeMissing = q.error instanceof AdapterRouteMissingError;
  const unknownWorkspace = q.error instanceof UnknownWorkspaceError;

  return {
    name,
    matches: q.data?.matches ?? [],
    isLoading: q.isLoading && name !== null,
    // Both diagnosed 404s are excluded, so a caller cannot render them as a
    // generic failure by accident.
    isError: q.isError && !routeMissing && !unknownWorkspace,
    // Distinguishes "answered with nothing" from "has not answered yet". The
    // zero-match state depends on that difference: an empty array before the
    // request completes is not an answer.
    isResolved: q.data !== undefined,
    routeMissing,
    unknownWorkspace,
  };
}
