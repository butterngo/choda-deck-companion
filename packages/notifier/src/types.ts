export type QueueEvent = {
  event: string;
  queueRunId?: unknown;
  taskCount?: unknown;
  totalCostUsd?: unknown;
  durationMs?: unknown;
  failedTaskIndex?: unknown;
  [k: string]: unknown;
};

export type NotifyPayload = {
  status: "finished" | "failed";
  queueRunId: string;
  taskCount: number;
  totalCostUsd: number;
  durationMs: number;
  /** 1-based. Only set when status="failed" and the failing task is known. */
  failedTaskIndex?: number;
};

export type PushFn = (payload: NotifyPayload) => Promise<void>;

export type Logger = (msg: string) => void;
