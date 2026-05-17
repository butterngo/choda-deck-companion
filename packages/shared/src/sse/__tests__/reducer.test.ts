import { describe, expect, it } from "vitest";
import { applySseEvent } from "../reducer.js";
import { initialLiveQueueState, type RunActiveEvent, type TickEvent } from "../types.js";

function runActive(opts: Partial<RunActiveEvent["data"]> = {}): RunActiveEvent {
  return {
    event: "run.active",
    data: { queueRunId: "qr-1", taskCount: 2, startedAt: "2026-05-17T10:00:00Z", ...opts },
  };
}

function tick(payload: TickEvent["data"]): TickEvent {
  return { event: "tick", data: payload };
}

describe("applySseEvent", () => {
  it("activates run on run.active", () => {
    const next = applySseEvent(initialLiveQueueState, runActive());
    expect(next.active).not.toBeNull();
    expect(next.active!.queueRunId).toBe("qr-1");
    expect(next.active!.taskCount).toBe(2);
    expect(next.active!.terminal).toBe(false);
  });

  it("ignores tick before run.active", () => {
    const next = applySseEvent(initialLiveQueueState, tick({ event: "task.started", taskId: "T1" }));
    expect(next.active).toBeNull();
  });

  it("records task.started", () => {
    let state = applySseEvent(initialLiveQueueState, runActive());
    state = applySseEvent(state, tick({ event: "task.started", taskId: "T1" }));
    expect(state.active!.tasks.get("T1")?.status).toBe("started");
  });

  it("accumulates totalCostUsd on task.finished", () => {
    let state = applySseEvent(initialLiveQueueState, runActive());
    state = applySseEvent(state, tick({ event: "task.finished", taskId: "T1", costUsd: 0.2 }));
    state = applySseEvent(state, tick({ event: "task.finished", taskId: "T2", costUsd: 0.3 }));
    expect(state.active!.totalCostUsd).toBeCloseTo(0.5);
  });

  it("records task.failed with reason", () => {
    let state = applySseEvent(initialLiveQueueState, runActive());
    state = applySseEvent(state, tick({ event: "task.failed", taskId: "T1", reason: "boom" }));
    const t = state.active!.tasks.get("T1");
    expect(t?.status).toBe("failed");
    expect(t?.reason).toBe("boom");
  });

  it("marks terminal=finished on run.finished", () => {
    let state = applySseEvent(initialLiveQueueState, runActive());
    state = applySseEvent(state, tick({ event: "run.finished", totalCostUsd: 1.5 }));
    expect(state.active!.terminal).toBe("finished");
    expect(state.active!.totalCostUsd).toBeCloseTo(1.5);
  });

  it("marks terminal=failed on run.failed with reason", () => {
    let state = applySseEvent(initialLiveQueueState, runActive());
    state = applySseEvent(state, tick({ event: "run.failed", reason: "OOM" }));
    expect(state.active!.terminal).toBe("failed");
    expect(state.active!.failedReason).toBe("OOM");
  });
});
