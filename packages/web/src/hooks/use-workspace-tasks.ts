// TASK-1766 / TASK-1773 — the tasks shown under a workspace.
//
// WHAT THIS USED TO SAY, and why it changed (2026-09-10):
//
// The original version of this file recorded a measured limitation: GET /tasks
// accepted no filter (`?projectId=` and `?workspaceId=` returned byte-identical
// 4,042,663-byte responses), task rows had no workspace field, and there was no
// touches route to fall back on. So scoping was by PROJECT and the UI said so
// rather than implying precision it could not back.
//
// TASK-1773 removed all three gaps. The adapter now filters, omits `body`
// (4,779,941 → 566,133 bytes on the same database), and runs the §5.3 cascade
// server-side, tagging each row `touches` | `session` | `unscoped`.
//
// THE OLD ADAPTER HAS NOT DISAPPEARED. A packaged companion carries a vendored
// adapter bundle, so a build from before TASK-1773 will ignore `?workspaceId=`
// and answer with the whole unscoped table — a 200, and a plausible list. That
// is the exact failure this feature exists to remove, so it is detected rather
// than assumed away: rows that come back with no `scope` after a workspace was
// requested mean the adapter is old, and the view says "project" again instead
// of claiming a workspace narrowing that never happened.

import { useQuery } from "@tanstack/react-query";
import { fetchWorkspaceTasks, type TaskSummary } from "../api";

/** Terminal states are hidden by default: a workspace view is about live work. */
const CLOSED = new Set(["DONE", "CANCELLED"]);

/**
 * `workspace` — the adapter ran the cascade and every row is tagged.
 * `project`   — the adapter is older than TASK-1773 and ignored the filter, so
 *               the list is the project's, exactly as it was before.
 */
export type TaskScopeKind = "workspace" | "project";

export interface WorkspaceTasksView {
  tasks: TaskSummary[];
  /** How the list was narrowed — rendered to the user, never left implicit. */
  scope: TaskScopeKind;
  isLoading: boolean;
  isError: boolean;
}

export function openTasks(all: TaskSummary[]): TaskSummary[] {
  return all.filter((t) => !CLOSED.has(t.status));
}

/**
 * An adapter that served the cascade tags EVERY row. One untagged row among
 * tagged ones would be a server bug rather than an old adapter, and reading
 * `some` instead of `every` here would hide it.
 */
export function scopeOf(tasks: TaskSummary[]): TaskScopeKind {
  if (tasks.length === 0) return "workspace";
  return tasks.every((t) => t.scope !== undefined) ? "workspace" : "project";
}

export function useWorkspaceTasks(workspaceId: string | null): WorkspaceTasksView {
  const q = useQuery({
    queryKey: ["tasks", "workspace", workspaceId],
    queryFn: ({ signal }) => fetchWorkspaceTasks(workspaceId as string, signal),
    enabled: workspaceId !== null,
    // Server-side now, so this is no longer 4 MB a poll — but the list still
    // does not change by the second.
    staleTime: 60_000,
  });
  const tasks = openTasks(q.data?.tasks ?? []);
  return {
    tasks,
    scope: scopeOf(tasks),
    isLoading: q.isLoading,
    isError: q.isError,
  };
}
