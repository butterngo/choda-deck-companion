import type { ActiveRunState } from "shared/sse";
import { formatCost, formatDuration } from "../utils";

export function ActiveRunCard({ active }: { active: ActiveRunState }) {
  const elapsed = Date.now() - new Date(active.startedAt).getTime();
  const finished = Array.from(active.tasks.values()).filter(
    (t) => t.status === "finished",
  ).length;
  const failed = Array.from(active.tasks.values()).filter(
    (t) => t.status === "failed",
  ).length;

  return (
    <div
      data-active-run
      className="border border-blue-300 dark:border-blue-700 rounded-lg p-3 mb-3 bg-blue-50/50 dark:bg-blue-950/30"
    >
      <div className="flex items-center gap-2 mb-1">
        <i className="ti ti-loader-2 spin text-blue-600 dark:text-blue-400" aria-hidden="true" />
        <span className="text-sm font-medium">Running</span>
        <span className="mono text-[12px] text-zinc-500">{active.queueRunId}</span>
        <span className="ml-auto text-[12px] text-zinc-500">{formatDuration(elapsed)}</span>
      </div>
      <div className="text-[12px] text-zinc-600 dark:text-zinc-400">
        {finished}/{active.taskCount} done · {failed} failed · {formatCost(active.totalCostUsd)}
      </div>
    </div>
  );
}
