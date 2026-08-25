// TASK-1782 — a workspace's git log. Same shape and cadence as
// use-workspace-docs, over the same single laptop API.
//
// The one thing this hook must not do is let a git failure look like an empty
// repository. The adapter answers 409 for "cwd is gone" and "cwd is not a git
// repo" (TASK-1779), and that arrives here as GitUnavailableError. Folding it
// into `isError` would be survivable; folding it into `commits: []` would not —
// an audit view showing zero rows reads as a fact about the history.

import { useQuery } from "@tanstack/react-query";
import { fetchWorkspaceCommits, GitUnavailableError, type WorkspaceCommit } from "../api";
import { HEALTH_POLL_MS } from "./use-health";

/** One page. 100 is the adapter's default and the page size the AC names. */
export const COMMIT_PAGE_SIZE = 100;

export interface WorkspaceCommitsView {
  commits: WorkspaceCommit[];
  hasMore: boolean;
  cwd: string | null;
  isLoading: boolean;
  isError: boolean;
  /** Set only when git could not be read — never for a plain request failure. */
  gitUnavailable: { label: string; cwd: string } | null;
}

export function useWorkspaceCommits(workspaceId: string | null): WorkspaceCommitsView {
  const q = useQuery({
    queryKey: ["workspace-commits", workspaceId],
    queryFn: ({ signal }) => fetchWorkspaceCommits(workspaceId as string, COMMIT_PAGE_SIZE, signal),
    enabled: workspaceId !== null,
    // History changes whenever Butter commits, which the app never hears about.
    // Same cadence as the docs list for the same reason.
    refetchInterval: HEALTH_POLL_MS,
    staleTime: 0,
    retry: false,
  });

  const unavailable =
    q.error instanceof GitUnavailableError ? { label: q.error.label, cwd: q.error.cwd } : null;

  return {
    commits: q.data?.commits ?? [],
    hasMore: q.data?.hasMore ?? false,
    cwd: q.data?.cwd ?? null,
    isLoading: q.isLoading,
    // Reported through its own field, so a caller branching on isError cannot
    // accidentally render a git failure as a generic one.
    isError: q.isError && unavailable === null,
    gitUnavailable: unavailable,
  };
}
