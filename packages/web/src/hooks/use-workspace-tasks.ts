// TASK-1766 — the tasks shown under a workspace.
//
// HONEST LIMITATION, measured rather than assumed (2026-08-24):
//
// The plan called for the touches → session cascade that /choda-task-focus §5.3
// uses, so tasks would be scoped to a WORKSPACE. That is not implementable
// against today's adapter:
//
//   * GET /tasks accepts no filter at all. `?projectId=` and `?workspaceId=`
//     are both ignored — all three responses came back byte-identical
//     (4,042,663 bytes, 1420 tasks, every one carrying its full body).
//   * Task rows have no workspace field: id, projectId, parentTaskId, title,
//     status, priority, labels, dueDate, pinned, filePath, body, blockedBy,
//     createdAt, updatedAt.
//   * There is no touches route to fall back on. The adapter serves exactly
//     /capture /conversations /healthz /inbox /projects /sync/* /tasks
//     /workspaces /workspace-docs.
//
// So scoping is by PROJECT, and the UI says so rather than implying these are
// the workspace's own tasks. Under-claiming is the safe direction: a task list
// that silently claimed workspace precision it does not have would be the same
// class of error as the port everyone assumed in TASK-1590.
//
// Real workspace scoping needs adapter work (filter + a touches surface), filed
// separately. Filtering client-side also means downloading 4 MB per poll, which
// is the second reason that task exists.

import { useQuery } from "@tanstack/react-query";
import { fetchAllTasks, type TaskSummary } from "../api";

/** Terminal states are hidden by default: a workspace view is about live work. */
const CLOSED = new Set(["DONE", "CANCELLED"]);

export interface WorkspaceTasksView {
  tasks: TaskSummary[];
  /** How the list was narrowed — rendered to the user, never left implicit. */
  scope: "project";
  isLoading: boolean;
  isError: boolean;
}

export function tasksForProject(all: TaskSummary[], projectId: string): TaskSummary[] {
  return all.filter((t) => t.projectId === projectId && !CLOSED.has(t.status));
}

export function useWorkspaceTasks(projectId: string | null): WorkspaceTasksView {
  const q = useQuery({
    queryKey: ["tasks", "all"],
    queryFn: ({ signal }) => fetchAllTasks(signal),
    enabled: projectId !== null,
    // 4 MB a poll would be indefensible; this list does not change by the second.
    staleTime: 60_000,
  });
  return {
    tasks: projectId === null ? [] : tasksForProject(q.data?.tasks ?? [], projectId),
    scope: "project",
    isLoading: q.isLoading,
    isError: q.isError,
  };
}
