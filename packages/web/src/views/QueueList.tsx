import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import type { QueueRunSummary } from "shared/types";
import { ActiveRunCard } from "../components/ActiveRunCard";
import { StatusChips } from "../components/StatusChips";
import { api } from "../api";
import { useLiveQueueContext } from "../layouts/Shell";
import { formatCost, formatDuration, relativeTime, statusClass, statusIcon } from "../utils";

export function QueueList() {
  const live = useLiveQueueContext();
  const [status, setStatus] = useState("");
  const { data = [], isLoading, error } = useQuery({
    queryKey: ["queue-runs"],
    queryFn: () => api.listQueueRuns(),
  });

  const filtered = status ? data.filter((r) => r.status === status) : data;

  return (
    <div>
      {live.active && <ActiveRunCard active={live.active} />}
      <StatusChips value={status} onChange={setStatus} />
      {isLoading && <p className="text-zinc-500 text-sm">Loading…</p>}
      {error && (
        <p className="text-red-600 dark:text-red-400 text-sm">
          {(error as Error).message}
        </p>
      )}
      <ul className="divide-y divide-zinc-200 dark:divide-zinc-700">
        {filtered.map((r) => (
          <QueueRow key={r.id} run={r} />
        ))}
        {!isLoading && filtered.length === 0 && (
          <li className="py-6 text-center text-zinc-500 text-sm">No runs yet.</li>
        )}
      </ul>
    </div>
  );
}

function QueueRow({ run }: { run: QueueRunSummary }) {
  return (
    <li>
      <Link
        to={`/queue/${encodeURIComponent(run.id)}`}
        className="flex items-center gap-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800"
      >
        <i
          className={`ti ${statusIcon(run.status)} ${statusClass(run.status)}`}
          aria-hidden="true"
        />
        <span className="mono text-[13px] flex-1 truncate">{run.id}</span>
        <span className="text-[12px] text-zinc-500">{run.taskCount} tasks</span>
        <span className="text-[12px] text-zinc-500 w-16 text-right">
          {formatCost(run.totalCostUsd)}
        </span>
        <span className="text-[12px] text-zinc-500 w-20 text-right">
          {formatDuration(run.durationMs)}
        </span>
        <span className="text-[12px] text-zinc-400 w-24 text-right hidden md:inline">
          {relativeTime(run.finishedAt)}
        </span>
      </Link>
    </li>
  );
}
