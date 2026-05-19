/**
 * Shape matches packages/server/src/data/artifacts.ts QueueRunSummary + QueueRunMeta.
 */
export interface QueueRunSummary {
  id: string;
  taskCount: number;
  totalCostUsd: number;
  durationMs: number;
  status: QueueRunStatus;
  finishedAt: string | null;
}

export type QueueRunStatus = "running" | "finished" | "failed";

/**
 * Executor-emitted outcome strings (per choda-deck queue-lifecycle-service).
 * Kept as a documented union; `TaskOutcome.outcome` stays `string` because
 * companion reads JSON from an external repo where the writer can diverge.
 */
export type TaskOutcomeStatus = "DONE" | "FAILED" | "SKIPPED_PREFLIGHT" | "SKIPPED";

export type TaskOutcomeTone = "success" | "danger" | "warning" | "muted";

/**
 * Maps an executor outcome string to a semantic tone the UI can render.
 * Case-insensitive — older artifacts or hand-edited files may have stray casing.
 * Unknown values fall back to `muted` (safer than throwing on display path).
 */
export function outcomeTone(outcome: string): TaskOutcomeTone {
  switch (outcome.toUpperCase()) {
    case "DONE":
      return "success";
    case "FAILED":
      return "danger";
    case "SKIPPED_PREFLIGHT":
      return "warning";
    case "SKIPPED":
      return "muted";
    default:
      return "muted";
  }
}

export interface TaskOutcome {
  taskId: string;
  outcome: string;
  costUsd?: number;
  reason?: string;
  account?: string | null;
  worktreePath?: string;
  branch?: string;
  headSha?: string;
}

export interface QueueRunMeta {
  queueRunId: string;
  startedAt: string;
  endedAt?: string;
  totalCostUsd?: number;
  halted?: boolean;
  taskOutcomes?: TaskOutcome[];
  [key: string]: unknown;
}

export interface QueueRunDetail {
  report: string;
  meta: QueueRunMeta;
}

export interface QueueStartRequest {
  taskId: string;
  projectId: string;
  workspaceId: string;
  source?: string;
}

export interface QueueStartResponse {
  queueRunId: string;
}
