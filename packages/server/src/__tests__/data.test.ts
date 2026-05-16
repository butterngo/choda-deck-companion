import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ArtifactsDirError, QueueRunNotFoundError, getQueueRun, listQueueRuns } from "../data/artifacts.js";

describe("artifacts", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "artifacts-test-"));

    const meta1 = {
      queueRunId: "1000000000000-aaaa",
      startedAt: "2026-05-01T10:00:00.000Z",
      endedAt: "2026-05-01T10:05:00.000Z",
      totalCostUsd: 0.15,
      halted: false,
      tasks: [{ id: "TASK-001", outcome: "DONE", costUsd: 0.15 }],
    };
    const meta2 = {
      queueRunId: "2000000000000-bbbb",
      startedAt: "2026-05-02T10:00:00.000Z",
      endedAt: "2026-05-02T10:10:00.000Z",
      totalCostUsd: 0.42,
      halted: false,
      tasks: [
        { id: "TASK-002", outcome: "DONE", costUsd: 0.21 },
        { id: "TASK-003", outcome: "DONE", costUsd: 0.21 },
      ],
    };

    await mkdir(join(dir, "queue-1000000000000-aaaa"));
    await writeFile(
      join(dir, "queue-1000000000000-aaaa", "queue-run.json"),
      JSON.stringify(meta1),
    );
    await writeFile(join(dir, "queue-1000000000000-aaaa", "report.md"), "# Run A\n\nDone.");

    await mkdir(join(dir, "queue-2000000000000-bbbb"));
    await writeFile(
      join(dir, "queue-2000000000000-bbbb", "queue-run.json"),
      JSON.stringify(meta2),
    );
    await writeFile(join(dir, "queue-2000000000000-bbbb", "report.md"), "# Run B\n\nAlso done.");

    // A dir without queue-run.json (tasks-only run, pre-ship state) — should be skipped
    await mkdir(join(dir, "queue-3000000000000-cccc"));
    await mkdir(join(dir, "queue-3000000000000-cccc", "tasks"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("listQueueRuns returns two runs, newest first", async () => {
    const runs = await listQueueRuns(dir);
    expect(runs).toHaveLength(2);
    expect(runs[0]?.id).toBe("queue-2000000000000-bbbb");
    expect(runs[1]?.id).toBe("queue-1000000000000-aaaa");
  });

  it("listQueueRuns returns correct shape", async () => {
    const runs = await listQueueRuns(dir);
    const run = runs[0]!;
    expect(run.taskCount).toBe(2);
    expect(run.totalCostUsd).toBe(0.42);
    expect(run.status).toBe("finished");
    expect(run.finishedAt).toBe("2026-05-02T10:10:00.000Z");
    expect(run.durationMs).toBe(10 * 60 * 1000);
  });

  it("listQueueRuns returns [] for empty dir", async () => {
    const emptyDir = await mkdtemp(join(tmpdir(), "artifacts-empty-"));
    try {
      const runs = await listQueueRuns(emptyDir);
      expect(runs).toEqual([]);
    } finally {
      await rm(emptyDir, { recursive: true, force: true });
    }
  });

  it("listQueueRuns throws ArtifactsDirError for missing dir", async () => {
    await expect(listQueueRuns("/nonexistent/path/xyz")).rejects.toBeInstanceOf(ArtifactsDirError);
  });

  it("getQueueRun returns report + meta", async () => {
    const result = await getQueueRun(dir, "queue-1000000000000-aaaa");
    expect(result.report).toContain("# Run A");
    expect(result.meta.queueRunId).toBe("1000000000000-aaaa");
  });

  it("getQueueRun throws QueueRunNotFoundError for missing id", async () => {
    await expect(getQueueRun(dir, "queue-nonexistent")).rejects.toBeInstanceOf(
      QueueRunNotFoundError,
    );
  });

  it("getQueueRun resolves stripped id with queue- prefix (active-run SSE shape)", async () => {
    // SSE active-run emits queueRunId without prefix — detail screen passes it as-is.
    const result = await getQueueRun(dir, "1000000000000-aaaa");
    expect(result.report).toContain("# Run A");
    expect(result.meta.queueRunId).toBe("1000000000000-aaaa");
  });

  it("getQueueRun resolves stripped id with queue-start- prefix", async () => {
    const queueStartDir = join(dir, "queue-start-5000000000000-eeee");
    await mkdir(queueStartDir);
    await writeFile(
      join(queueStartDir, "queue-run.json"),
      JSON.stringify({
        queueRunId: "5000000000000-eeee",
        startedAt: "2026-05-04T10:00:00.000Z",
        endedAt: "2026-05-04T10:01:00.000Z",
        totalCostUsd: 0,
        halted: false,
        tasks: [],
      }),
    );
    await writeFile(join(queueStartDir, "report.md"), "# Run E\n");

    const result = await getQueueRun(dir, "5000000000000-eeee");
    expect(result.report).toContain("# Run E");
    expect(result.meta.queueRunId).toBe("5000000000000-eeee");
  });

  it("halted run has status 'failed'", async () => {
    const failedDir = join(dir, "queue-4000000000000-dddd");
    await mkdir(failedDir);
    await writeFile(
      join(failedDir, "queue-run.json"),
      JSON.stringify({
        queueRunId: "4000000000000-dddd",
        startedAt: "2026-05-03T10:00:00.000Z",
        endedAt: "2026-05-03T10:03:00.000Z",
        totalCostUsd: 0.05,
        halted: true,
        tasks: [],
      }),
    );
    const runs = await listQueueRuns(dir);
    const failed = runs.find((r) => r.id === "queue-4000000000000-dddd");
    expect(failed?.status).toBe("failed");
  });
});
