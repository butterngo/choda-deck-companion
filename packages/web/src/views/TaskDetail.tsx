import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { Markdown } from "../components/Markdown";
import { RunInQueueButton } from "../components/RunInQueueButton";
import { api } from "../api";
import { useWorkspace } from "../hooks/use-workspace";
import { statusClass } from "../utils";

export function TaskDetail() {
  const { id = "" } = useParams<{ id: string }>();
  const { activeProject, activeWorkspace } = useWorkspace();
  const { data, isLoading, error } = useQuery({
    queryKey: ["task", id],
    queryFn: () => api.getTask(id),
    enabled: !!id,
  });

  return (
    <div>
      <p className="mb-3">
        <Link to="/tasks" className="text-[13px] text-zinc-500 hover:underline">
          <i className="ti ti-arrow-left mr-1" aria-hidden="true" /> Tasks
        </Link>
      </p>
      {isLoading && <p className="text-zinc-500 text-sm">Loading…</p>}
      {error && (
        <p className="text-red-600 dark:text-red-400 text-sm">
          {(error as Error).message}
        </p>
      )}
      {data && (
        <>
          <h1 className="text-[22px] mb-1">{data.title ?? data.id}</h1>
          <p className="text-[12px] mb-3">
            <span className="mono text-zinc-500">{data.id}</span>
            <span className={`ml-2 ${statusClass(data.status)}`}>{data.status}</span>
          </p>
          <RunInQueueButton
            taskId={data.id}
            projectId={(data.project_id as string | undefined) ?? activeProject ?? undefined}
            workspaceId={activeWorkspace}
            disabled={data.status !== "READY"}
          />
          {data.body && <Markdown source={data.body} />}
        </>
      )}
    </div>
  );
}
