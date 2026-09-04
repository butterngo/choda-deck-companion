// TASK-1830 — the effective config inventory for one workspace.
//
// Same shape and cadence as use-workspace-docs, over the same single-laptop
// API. Two failures are kept distinguishable from a plain error for the same
// reason TASK-1799 separated them on the symbol lookup: "your app is behind"
// and "that workspace is not registered" are different facts about a working
// system, and only one of them means anything is broken.
//
// The outdated-adapter branch is not hypothetical here. The packaged companion
// runs a VENDORED adapter bundle that refreshes only at release (INBOX-1888),
// so every installed build before the next release will hit exactly this state.

import { useQuery } from "@tanstack/react-query";
import {
  AdapterRouteMissingError,
  fetchClaudeConfig,
  UnknownWorkspaceError,
  type ClaudeConfigResult,
} from "../api";
import { HEALTH_POLL_MS } from "./use-health";

export interface ClaudeConfigView {
  config: ClaudeConfigResult | null;
  isLoading: boolean;
  isError: boolean;
  /** The adapter predates this route — the app is older than the client. */
  outdatedAdapter: boolean;
  /** The route exists; this workspace id does not. */
  unknownWorkspace: boolean;
}

export function useClaudeConfig(workspaceId: string | null): ClaudeConfigView {
  const q = useQuery({
    queryKey: ["claude-config", workspaceId],
    queryFn: ({ signal }) => fetchClaudeConfig(workspaceId, signal),
    enabled: workspaceId !== null,
    // These are files Butter also edits by hand, and plugins get installed
    // while the app is open — the shared cadence keeps a new skill appearing
    // without a reload.
    refetchInterval: HEALTH_POLL_MS,
    staleTime: 0,
    retry: false,
  });

  const outdatedAdapter = q.error instanceof AdapterRouteMissingError;
  const unknownWorkspace = q.error instanceof UnknownWorkspaceError;

  return {
    config: q.data ?? null,
    isLoading: q.isLoading,
    // A diagnosed 404 is not an error state: both are ordinary facts about a
    // working system, and painting them red would train the eye to ignore the
    // failures that matter.
    isError: q.isError && !outdatedAdapter && !unknownWorkspace,
    outdatedAdapter,
    unknownWorkspace,
  };
}
