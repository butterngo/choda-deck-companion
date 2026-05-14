import type { NotifyPayload } from "./types.js";

export function formatCost(usd: number): string {
  const safe = Number.isFinite(usd) ? usd : 0;
  return `$${safe.toFixed(2)}`;
}

export function formatDuration(ms: number): string {
  const safe = Number.isFinite(ms) && ms > 0 ? ms : 0;
  const totalSec = Math.round(safe / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

export function buildTitle(payload: NotifyPayload): string {
  if (payload.status === "finished") {
    return `Done · ${payload.taskCount} tasks`;
  }
  if (typeof payload.failedTaskIndex === "number" && payload.failedTaskIndex > 0) {
    return `Failed · task ${payload.failedTaskIndex} of ${payload.taskCount}`;
  }
  return `Failed · ${payload.taskCount} tasks`;
}

export function buildBody(payload: NotifyPayload): string {
  return `${formatCost(payload.totalCostUsd)} · ${formatDuration(payload.durationMs)} · ${payload.queueRunId}`;
}

export function buildPriority(payload: NotifyPayload): "3" | "4" {
  return payload.status === "finished" ? "3" : "4";
}
