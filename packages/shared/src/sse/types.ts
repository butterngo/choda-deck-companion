/**
 * SSE event shapes emitted by GET /api/queue/live.
 * See packages/server/src/routes/queue.ts handleQueueLive.
 */

export interface RunActiveEvent {
  event: "run.active";
  data: {
    queueRunId: string;
    taskCount: number;
    startedAt: string;
  };
}

/** Tick events come from queue.jsonl lines; data is the parsed JSON object. */
export interface TickEvent {
  event: "tick";
  data: TickPayload;
  id?: string;
}

export type TickPayload =
  | { event: "task.started"; taskId: string; [k: string]: unknown }
  | { event: "task.finished"; taskId: string; costUsd?: number; [k: string]: unknown }
  | { event: "task.failed"; taskId: string; reason?: string; [k: string]: unknown }
  | { event: "run.finished"; totalCostUsd?: number; [k: string]: unknown }
  | { event: "run.failed"; reason?: string; [k: string]: unknown }
  | { event: string; [k: string]: unknown };

export type SseEvent = RunActiveEvent | TickEvent;

export interface ActiveRunState {
  queueRunId: string;
  taskCount: number;
  startedAt: string;
  totalCostUsd: number;
  tasks: Map<string, TaskTickState>;
  terminal: false | "finished" | "failed";
  failedReason?: string;
}

export interface TaskTickState {
  taskId: string;
  status: "started" | "finished" | "failed";
  costUsd?: number;
  reason?: string;
}

export interface LiveQueueState {
  active: ActiveRunState | null;
}

export const initialLiveQueueState: LiveQueueState = { active: null };
