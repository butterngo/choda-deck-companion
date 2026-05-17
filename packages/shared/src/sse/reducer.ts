import type {
  ActiveRunState,
  LiveQueueState,
  RunActiveEvent,
  TickEvent,
  TickPayload,
} from "./types.js";

/**
 * Pure reducer for SSE events from /api/queue/live.
 * Web wraps EventSource; mobile wraps react-native-sse — both feed the same reducer.
 */
export function applySseEvent(state: LiveQueueState, event: RunActiveEvent | TickEvent): LiveQueueState {
  if (event.event === "run.active") {
    const data = event.data;
    return {
      active: {
        queueRunId: data.queueRunId,
        taskCount: data.taskCount,
        startedAt: data.startedAt,
        totalCostUsd: 0,
        tasks: new Map(),
        terminal: false,
      },
    };
  }
  if (event.event === "tick") {
    if (!state.active) return state;
    return { active: applyTick(state.active, event.data) };
  }
  return state;
}

function applyTick(active: ActiveRunState, payload: TickPayload): ActiveRunState {
  switch (payload.event) {
    case "task.started": {
      const tasks = new Map(active.tasks);
      const taskId = String(payload.taskId);
      tasks.set(taskId, { taskId, status: "started" });
      return { ...active, tasks };
    }
    case "task.finished": {
      const tasks = new Map(active.tasks);
      const taskId = String(payload.taskId);
      const cost = typeof payload.costUsd === "number" ? payload.costUsd : 0;
      tasks.set(taskId, { taskId, status: "finished", costUsd: cost });
      return {
        ...active,
        tasks,
        totalCostUsd: active.totalCostUsd + cost,
      };
    }
    case "task.failed": {
      const tasks = new Map(active.tasks);
      const taskId = String(payload.taskId);
      const reason = typeof payload.reason === "string" ? payload.reason : undefined;
      tasks.set(taskId, { taskId, status: "failed", reason });
      return { ...active, tasks };
    }
    case "run.finished": {
      const total = typeof payload.totalCostUsd === "number" ? payload.totalCostUsd : active.totalCostUsd;
      return { ...active, totalCostUsd: total, terminal: "finished" };
    }
    case "run.failed": {
      const reason = typeof payload.reason === "string" ? payload.reason : undefined;
      return { ...active, terminal: "failed", failedReason: reason };
    }
    default:
      return active;
  }
}
