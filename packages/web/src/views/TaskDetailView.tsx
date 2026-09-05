// TASK-1748 — the route `/tasks/:id`, so a task is a place you can link to.
//
// Deliberately a route rather than more drawer: "click a task" needs somewhere
// to land from a workspace, Search and Graph alike, and going via the graph screen
// to hunt for a node does not match how the question actually comes up. The
// graph's own drawer keeps rendering TaskDetailPanel exactly as before — this
// view reuses the same component rather than forking it.

import { useParams, Link, useLocation } from "react-router-dom";
import { useTask } from "../hooks/use-task";
import { TaskDetailPanel } from "../components/TaskDetailPanel";
import { TaskProvenance } from "../components/TaskProvenance";
import { AcGrader } from "../components/AcGrader";
import { ErrorState } from "../components/state/ErrorState";
import { EmptyState } from "../components/state/EmptyState";
import { Skeleton } from "../components/state/Skeleton";

export function TaskDetailView(): React.JSX.Element {
  const { id } = useParams<{ id: string }>();
  const { task, isLoading, isError } = useTask(id ?? null);

  const adrs = task?.adrs ?? [];
  const files = task?.files ?? [];
  const commits = task?.commits ?? [];
  const nothingRecorded = adrs.length === 0 && files.length === 0 && commits.length === 0;

  // TASK-1788 — where "back" goes depends on where the reader came from.
  //
  // This used to be a hard link to /projects, which TASK-1777 put here when the
  // Cockpit was removed. Arriving from a workspace's Tasks tab, that threw the
  // reader TWO levels up and forgot which workspace they were in. The previous
  // value read "Cockpit" and was wrong in a different direction, so "it was
  // already like this" was never a defence.
  //
  // The fallback is load-bearing, not politeness. A reader can reach this page
  // with no origin at all — a deep link, Search, the graph drawer — and a
  // packaged Electron window has no address bar and no browser back button
  // (INBOX-1875). An implementation that only handled the carried case would
  // leave those readers with nothing.
  const location = useLocation();
  const carried = (location.state as { from?: { to?: string; label?: string } } | null)?.from;
  const origin =
    carried?.to && carried.to.length > 0
      ? { to: carried.to, label: carried.label ?? "Back" }
      : { to: "/projects", label: "Projects" };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex items-center gap-1.5 text-xs text-zinc-400">
        <Link to={origin.to} data-testid="task-breadcrumb" className="flex items-center gap-1.5">
          <i className="ti ti-chevron-left" aria-hidden="true" />
          {origin.label}
        </Link>
        <span>/</span>
        <span className="text-zinc-500">Task</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex max-w-[980px] flex-col gap-4">
          {isLoading && <Skeleton shape="list" label="Loading task…" />}

          {/* The API answered and this one task failed — everything else in the
              app is still current, so this is `failed`, never `unreachable`. */}
          {isError && <ErrorState variant="failed" subject={`task ${id ?? ""}`.trim()} />}

          {task && (
            <>
              <TaskDetailPanel task={task} />
              {/* TASK-1860 — grading is a button, never a consequence of opening
                  the task. It reaches a provider and everything else here does
                  not. */}
              <AcGrader taskId={task.id} />
              <TaskProvenance
                adrs={adrs}
                files={files}
                commits={commits}
                filesConfidence={task.filesConfidence ?? "known"}
              />
              {nothingRecorded && (
                <EmptyState
                  icon="ti-git-commit"
                  title="No work recorded yet"
                  description="No session has run on this task, so there are no commits, files or decisions to show."
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
