// TASK-1749 — a workspace's .md docs list, plus one document on demand. Same
// shape and cadence as use-vault, over the same single laptop API.
//
// The one thing this hook adds over use-vault: it keeps the folder-missing
// failure distinguishable. `isError` alone would collapse "the folder for this
// workspace is gone" into "the request failed", and the view has to say which.

import { useQuery } from "@tanstack/react-query";
import {
  BinaryFileError,
  fetchWorkspaceDoc,
  fetchWorkspaceDocs,
  WorkspaceFolderMissingError,
  type WorkspaceDoc,
} from "../api";
import { HEALTH_POLL_MS } from "./use-health";

export interface WorkspaceDocsView {
  docs: WorkspaceDoc[];
  cwd: string | null;
  label: string | null;
  isLoading: boolean;
  isError: boolean;
  /** Set only when the workspace's folder is not on disk — never for a plain failure. */
  missingFolder: { label: string; cwd: string } | null;
}

export function useWorkspaceDocs(workspaceId: string | null): WorkspaceDocsView {
  const q = useQuery({
    queryKey: ["workspace-docs", workspaceId],
    queryFn: ({ signal }) => fetchWorkspaceDocs(workspaceId as string, signal),
    enabled: workspaceId !== null,
    // Docs are files Butter also edits by hand, so they change without the app
    // knowing — the shared cadence keeps a new file showing up without a reload.
    refetchInterval: HEALTH_POLL_MS,
    staleTime: 0,
    retry: false,
  });

  const missing =
    q.error instanceof WorkspaceFolderMissingError
      ? { label: q.error.label, cwd: q.error.cwd }
      : null;

  return {
    docs: q.data?.docs ?? [],
    cwd: q.data?.cwd ?? null,
    label: q.data?.label ?? null,
    isLoading: q.isLoading,
    // A missing folder is reported through its own field, so a caller that
    // branches on isError cannot accidentally render it as a generic failure.
    isError: q.isError && missing === null,
    missingFolder: missing,
  };
}

export interface WorkspaceDocView {
  markdown: string | null;
  isLoading: boolean;
  isError: boolean;
  /** TASK-1788 — set only when the file is binary. Not a failure. */
  isBinary: boolean;
}

export function useWorkspaceDoc(
  workspaceId: string | null,
  path: string | null
): WorkspaceDocView {
  const q = useQuery({
    queryKey: ["workspace-docs", workspaceId, path],
    queryFn: ({ signal }) => fetchWorkspaceDoc(workspaceId as string, path as string, signal),
    enabled: workspaceId !== null && path !== null,
    staleTime: 0,
  });
  const binary = q.error instanceof BinaryFileError;
  return {
    markdown: q.data ?? null,
    isLoading: q.isLoading,
    // Reported through its own field so a caller branching on isError cannot
    // render "couldn't load this" for a file that loaded fine and simply is
    // not text.
    isError: q.isError && !binary,
    isBinary: binary,
  };
}
