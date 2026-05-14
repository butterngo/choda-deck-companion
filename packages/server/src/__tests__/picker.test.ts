import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { pickActiveQueueDir } from "../data/picker.js";

describe("pickActiveQueueDir", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "picker-test-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns null when no queue-* dirs exist", async () => {
    expect(await pickActiveQueueDir(dir)).toBeNull();
  });

  it("returns null when queue.jsonl does not exist", async () => {
    await mkdir(join(dir, "queue-1000000000000-aaa"));
    expect(await pickActiveQueueDir(dir)).toBeNull();
  });

  it("returns null when last event is run.finished (terminal)", async () => {
    const queueDir = join(dir, "queue-1000000000000-aaa");
    await mkdir(queueDir);
    const lines = [
      JSON.stringify({ event: "task.started", queueRunId: "1000000000000-aaa", taskId: "TASK-001", taskIndex: 1 }),
      JSON.stringify({ event: "run.finished", queueRunId: "1000000000000-aaa", taskCount: 1, totalCostUsd: 0.1, durationMs: 5000 }),
    ];
    await writeFile(join(queueDir, "queue.jsonl"), lines.join("\n") + "\n");
    expect(await pickActiveQueueDir(dir)).toBeNull();
  });

  it("returns null when last event is run.failed (terminal)", async () => {
    const queueDir = join(dir, "queue-1000000000000-aaa");
    await mkdir(queueDir);
    const lines = [
      JSON.stringify({ event: "task.started", queueRunId: "1000000000000-aaa", taskId: "TASK-001", taskIndex: 1 }),
      JSON.stringify({ event: "run.failed", queueRunId: "1000000000000-aaa", taskCount: 1, totalCostUsd: 0, durationMs: 1000, failedTaskIndex: 1 }),
    ];
    await writeFile(join(queueDir, "queue.jsonl"), lines.join("\n") + "\n");
    expect(await pickActiveQueueDir(dir)).toBeNull();
  });

  it("returns active run when last event is non-terminal and mtime is recent", async () => {
    const queueDir = join(dir, "queue-1000000000000-aaa");
    await mkdir(queueDir);
    await writeFile(
      join(queueDir, "queue.jsonl"),
      JSON.stringify({ event: "task.started", queueRunId: "1000000000000-aaa", taskId: "TASK-001", taskIndex: 1 }) + "\n",
    );
    const result = await pickActiveQueueDir(dir);
    expect(result).not.toBeNull();
    expect(result?.queueRunId).toBe("1000000000000-aaa");
    expect(result?.taskCount).toBe(1);
    expect(result?.lineCount).toBe(1);
  });

  it("returns null when mtime > 30 minutes (abandoned)", async () => {
    const queueDir = join(dir, "queue-1000000000000-aaa");
    await mkdir(queueDir);
    const jsonlPath = join(queueDir, "queue.jsonl");
    await writeFile(
      jsonlPath,
      JSON.stringify({ event: "task.started", queueRunId: "1000000000000-aaa", taskId: "TASK-001", taskIndex: 1 }) + "\n",
    );
    const oldTime = new Date(Date.now() - 31 * 60 * 1000);
    await utimes(jsonlPath, oldTime, oldTime);
    expect(await pickActiveQueueDir(dir)).toBeNull();
  });

  it("returns newest by mtime when multiple active runs exist", async () => {
    const olderDir = join(dir, "queue-1000000000000-aaa");
    const newerDir = join(dir, "queue-2000000000000-bbb");
    await mkdir(olderDir);
    await mkdir(newerDir);
    const line = JSON.stringify({ event: "task.started", queueRunId: "X", taskId: "TASK-001", taskIndex: 1 });
    const olderJsonl = join(olderDir, "queue.jsonl");
    const newerJsonl = join(newerDir, "queue.jsonl");
    await writeFile(olderJsonl, line + "\n");
    await writeFile(newerJsonl, line + "\n");
    const olderTime = new Date(Date.now() - 5 * 60 * 1000);
    await utimes(olderJsonl, olderTime, olderTime);
    const newerTime = new Date(Date.now() - 1 * 60 * 1000);
    await utimes(newerJsonl, newerTime, newerTime);
    const result = await pickActiveQueueDir(dir);
    expect(result?.dirPath).toContain("queue-2000000000000-bbb");
  });
});
