// TASK-1748 — the route `/tasks/:id`, so a task is a place you can link to.
//
// Deliberately a route rather than more drawer: "click a task" needs somewhere
// to land from Cockpit, Search and Graph alike, and going via the graph screen
// to hunt for a node does not match how the question actually comes up. The
// graph's own drawer keeps rendering TaskDetailPanel exactly as before — this
// view reuses the same component rather than forking it.

import { useParams, Link } from "react-router-dom";
import { useTask } from "../hooks/use-task";
import { TaskDetailPanel } from "../components/TaskDetailPanel";
import { TaskProvenance } from "../components/TaskProvenance";
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

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex items-center gap-1.5 text-xs text-zinc-400">
        <Link to="/cockpit" className="flex items-center gap-1.5">
          <i className="ti ti-chevron-left" aria-hidden="true" />
          Cockpit
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
