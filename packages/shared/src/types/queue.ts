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
