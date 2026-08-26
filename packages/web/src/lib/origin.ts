// TASK-1793 — where a detail view's "back" link points, carried through router
// state from the screen the reader left.
//
// The type lives here rather than at either end of the journey, because it has
// two ends: TaskDetailView READS it out of `location.state`, and every component
// that links to a task WRITES it. Defining it at one end would make the other
// import from a module it otherwise has nothing to do with, and the shape would
// drift the first time only one side was edited.
//
// TASK-1788 built the reading half and wired exactly one of the three writers.
// The other two were in the History tab, so the audit chain this whole epic
// exists for — commit → task → why — dead-ended at "Projects", two levels above
// the workspace the reader was in. Builders rather than inline object literals
// are the point: a call site can forget a field, but it cannot forget one of
// these and still typecheck.

export type Origin = { to: string; label: string };

/** A workspace's History tab, as a destination to come back to. */
export function historyOrigin(workspaceId: string, label: string): Origin {
  return { to: `/workspaces/${encodeURIComponent(workspaceId)}?tab=history`, label };
}

/** A workspace's Tasks tab, as a destination to come back to. */
export function tasksOrigin(workspaceId: string, label: string): Origin {
  return { to: `/workspaces/${encodeURIComponent(workspaceId)}?tab=tasks`, label };
}
