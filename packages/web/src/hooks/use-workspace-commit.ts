// TASK-1783 — one commit's detail, over GET /workspaces/:id/commits/:sha.
//
// `staleTime: Infinity` is not a caching flourish, it is a statement about the
// data: a commit is immutable. Its subject, body and stat cannot change once
// written, so re-fetching one a reader reopens would be work with no possible
// new answer.
//
// The one field that CAN change is `reachability` — a branch commit becomes
// default-branch when it merges, and a squashed one becomes unreachable. That
// moves on the order of a merge, not a render, so a reader who reopens the same
// panel within a session sees a value that is at worst one merge old. Being
// wrong about that for a few minutes is cheaper than a request per open.

import { useQuery } from "@tanstack/react-query";
import { fetchWorkspaceCommit, type WorkspaceCommitDetail } from "../api";

export interface WorkspaceCommitDetailView {
  commit: WorkspaceCommitDetail | null;
  isLoading: boolean;
  isError: boolean;
}

export function useWorkspaceCommit(
  workspaceId: string | null,
  sha: string | null
): WorkspaceCommitDetailView {
  const q = useQuery({
    queryKey: ["workspace-commit", workspaceId, sha],
    queryFn: ({ signal }) => fetchWorkspaceCommit(workspaceId as string, sha as string, signal),
    enabled: workspaceId !== null && sha !== null,
    staleTime: Infinity,
    retry: false,
  });

  return {
    commit: q.data ?? null,
    isLoading: q.isLoading,
    isError: q.isError,
  };
}
