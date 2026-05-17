import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import type { TaskOutcome } from "shared/types";
import { Markdown } from "../components/Markdown";
import { api } from "../api";
import { formatCost, statusClass, statusIcon } from "../utils";

export function QueueDetail() {
  const { id = "" } = useParams<{ id: string }>();
  const { data, isLoading, error } = useQuery({
    queryKey: ["queue-run", id],
    queryFn: () => api.getQueueRun(id),
    enabled: !!id,
  });

  return (
    <div>
      <p className="mb-3">
        <Link to="/queue" className="text-[13px] text-zinc-500 hover:underline">
          <i className="ti ti-arrow-left mr-1" aria-hidden="true" /> Queue
        </Link>
      </p>
      <h1 className="text-[22px] mb-1 mono">{id}</h1>
      {isLoading && <p className="text-zinc-500 text-sm">Loading…</p>}
      {error && (
        <p className="text-red-600 dark:text-red-400 text-sm">
          {(error as Error).message}
        </p>
      )}
      {data && (
        <>
          <TaskOutcomeList outcomes={data.meta.taskOutcomes ?? []} />
          {data.report && (
            <section className="mt-6">
              <h2 className="text-[18px] mb-2">Report</h2>
              <Markdown source={data.report} />
            </section>
          )}
        </>
      )}
    </div>
  );
}

function TaskOutcomeList({ outcomes }: { outcomes: TaskOutcome[] }) {
  if (outcomes.length === 0) {
    return <p className="text-zinc-500 text-sm">No task outcomes recorded.</p>;
  }
  return (
    <ul className="divide-y divide-zinc-200 dark:divide-zinc-700 border border-zinc-200 dark:border-zinc-700 rounded">
      {outcomes.map((o) => (
        <li key={o.taskId} className="py-2 px-3 flex items-start gap-3">
          <i
            className={`ti ${statusIcon(o.outcome)} ${statusClass(o.outcome)} mt-0.5`}
            aria-hidden="true"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="mono text-[13px]">{o.taskId}</span>
              <span className={`text-[12px] ${statusClass(o.outcome)}`}>{o.outcome}</span>
              <span className="ml-auto text-[12px] text-zinc-500">{formatCost(o.costUsd)}</span>
            </div>
            {o.outcome === "FAILED" && o.reason && (
              <p className="mt-1 text-[12px] text-red-600 dark:text-red-400 break-words">
                {o.reason}
              </p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
