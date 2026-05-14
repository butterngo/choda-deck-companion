import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { startNotifier, type NotifierHandle } from "../notifier.js";
import type { NotifyPayload } from "../types.js";

async function mkTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "notifier-test-"));
}

async function waitFor(predicate: () => boolean, timeoutMs = 4000, intervalMs = 30): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`waitFor timed out after ${timeoutMs}ms`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

describe("startNotifier — 4 AC scenarios", () => {
  let tmpRoot: string;
  let handle: NotifierHandle | null;

  beforeEach(async () => {
    tmpRoot = await mkTempDir();
    handle = null;
  });

  afterEach(async () => {
    if (handle) await handle.stop();
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it("Scenario A — run.started ignored, run.finished dispatched, custom event ignored", async () => {
    const queueDir = path.join(tmpRoot, "queue-A");
    await fs.mkdir(queueDir, { recursive: true });
    const jsonl = path.join(queueDir, "queue.jsonl");
    await fs.writeFile(jsonl, "");

    const pushed: NotifyPayload[] = [];
    handle = await startNotifier({
      artifactsDir: tmpRoot,
      topic: "t",
      pushFn: async (p) => { pushed.push(p); },
      log: () => { /* */ },
      rescanIntervalMs: 200,
    });
    await new Promise((r) => setTimeout(r, 100));

    const lines = [
      JSON.stringify({ event: "run.started", queueRunId: "qA", taskCount: 2, taskTitle: "SECRET" }),
      JSON.stringify({
        event: "run.finished",
        queueRunId: "qA",
        taskCount: 2,
        totalCostUsd: 0.12,
        durationMs: 1500,
        taskTitle: "SECRET",
        diff: "+++",
      }),
      JSON.stringify({ event: "custom.metric", foo: "bar" }),
    ].join("\n") + "\n";
    await fs.appendFile(jsonl, lines);

    await waitFor(() => pushed.length >= 1);
    await new Promise((r) => setTimeout(r, 150));

    expect(pushed).toHaveLength(1);
    expect(pushed[0]).toEqual({
      status: "finished",
      queueRunId: "qA",
      taskCount: 2,
      totalCostUsd: 0.12,
      durationMs: 1500,
    });
    expect(JSON.stringify(pushed[0])).not.toMatch(/SECRET|taskTitle|diff/);
  });

  it("Scenario B — run.failed with explicit failedTaskIndex on event", async () => {
    const queueDir = path.join(tmpRoot, "queue-B");
    await fs.mkdir(queueDir, { recursive: true });
    const jsonl = path.join(queueDir, "queue.jsonl");
    await fs.writeFile(jsonl, "");

    const pushed: NotifyPayload[] = [];
    handle = await startNotifier({
      artifactsDir: tmpRoot,
      topic: "t",
      pushFn: async (p) => { pushed.push(p); },
      log: () => { /* */ },
      rescanIntervalMs: 200,
    });
    await new Promise((r) => setTimeout(r, 100));

    await fs.appendFile(
      jsonl,
      JSON.stringify({
        event: "run.failed",
        queueRunId: "qB",
        taskCount: 5,
        totalCostUsd: 0.20,
        durationMs: 9999,
        failedTaskIndex: 3,
      }) + "\n",
    );

    await waitFor(() => pushed.length >= 1);
    expect(pushed[0]).toEqual({
      status: "failed",
      queueRunId: "qB",
      taskCount: 5,
      totalCostUsd: 0.20,
      durationMs: 9999,
      failedTaskIndex: 3,
    });
  });

  it("Scenario C — run.failed derives failedTaskIndex from preceding task.started events", async () => {
    const queueDir = path.join(tmpRoot, "queue-C");
    await fs.mkdir(queueDir, { recursive: true });
    const jsonl = path.join(queueDir, "queue.jsonl");
    await fs.writeFile(jsonl, "");

    const pushed: NotifyPayload[] = [];
    handle = await startNotifier({
      artifactsDir: tmpRoot,
      topic: "t",
      pushFn: async (p) => { pushed.push(p); },
      log: () => { /* */ },
      rescanIntervalMs: 200,
    });
    await new Promise((r) => setTimeout(r, 100));

    const lines = [
      JSON.stringify({ event: "task.started", taskId: "TASK-100" }),
      JSON.stringify({ event: "task.started", taskId: "TASK-101" }),
      JSON.stringify({ event: "task.started", taskId: "TASK-102" }),
      JSON.stringify({
        event: "run.failed",
        queueRunId: "qC",
        taskCount: 5,
        totalCostUsd: 0.15,
        durationMs: 30_000,
        // no failedTaskIndex — should derive 3 from task.started count
      }),
    ].join("\n") + "\n";
    await fs.appendFile(jsonl, lines);

    await waitFor(() => pushed.length >= 1);
    expect(pushed[0]?.status).toBe("failed");
    expect(pushed[0]?.failedTaskIndex).toBe(3);
  });

  it("Scenario D — run.failed fallback when neither event nor task.started provides index", async () => {
    const queueDir = path.join(tmpRoot, "queue-D");
    await fs.mkdir(queueDir, { recursive: true });
    const jsonl = path.join(queueDir, "queue.jsonl");
    await fs.writeFile(jsonl, "");

    const pushed: NotifyPayload[] = [];
    handle = await startNotifier({
      artifactsDir: tmpRoot,
      topic: "t",
      pushFn: async (p) => { pushed.push(p); },
      log: () => { /* */ },
      rescanIntervalMs: 200,
    });
    await new Promise((r) => setTimeout(r, 100));

    await fs.appendFile(
      jsonl,
      JSON.stringify({
        event: "run.failed",
        queueRunId: "qD",
        taskCount: 7,
        totalCostUsd: 0.05,
        durationMs: 1000,
      }) + "\n",
    );

    await waitFor(() => pushed.length >= 1);
    expect(pushed[0]?.status).toBe("failed");
    expect(pushed[0]?.failedTaskIndex).toBeUndefined();
  });

  it("skips malformed lines without crashing the watcher", async () => {
    const queueDir = path.join(tmpRoot, "queue-mixed");
    await fs.mkdir(queueDir, { recursive: true });
    const jsonl = path.join(queueDir, "queue.jsonl");
    await fs.writeFile(jsonl, "");

    const pushed: NotifyPayload[] = [];
    handle = await startNotifier({
      artifactsDir: tmpRoot,
      topic: "t",
      pushFn: async (p) => { pushed.push(p); },
      log: () => { /* */ },
      rescanIntervalMs: 200,
    });
    await new Promise((r) => setTimeout(r, 100));

    const validLine = JSON.stringify({
      event: "run.finished",
      queueRunId: "qok",
      taskCount: 1,
      totalCostUsd: 0.01,
      durationMs: 50,
    });
    await fs.appendFile(jsonl, `{this is not json\n${validLine}\n`);

    await waitFor(() => pushed.length >= 1);
    expect(pushed).toHaveLength(1);
    expect(pushed[0]?.queueRunId).toBe("qok");
  });

  it("picks up a queue.jsonl created after startup", async () => {
    const pushed: NotifyPayload[] = [];
    handle = await startNotifier({
      artifactsDir: tmpRoot,
      topic: "t",
      pushFn: async (p) => { pushed.push(p); },
      log: () => { /* */ },
      rescanIntervalMs: 100,
    });

    const queueDir = path.join(tmpRoot, "queue-late");
    await fs.mkdir(queueDir, { recursive: true });
    const jsonl = path.join(queueDir, "queue.jsonl");
    await fs.writeFile(
      jsonl,
      JSON.stringify({
        event: "run.finished",
        queueRunId: "late",
        taskCount: 1,
        totalCostUsd: 0.01,
        durationMs: 10,
      }) + "\n",
    );

    await waitFor(() => pushed.length >= 1, 5000);
    expect(pushed[0]?.queueRunId).toBe("late");
  });
});
