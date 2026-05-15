import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { handleQueueList, handleQueueLive } from "../routes/queue.js";
import { handleInboxGet, handleInboxList } from "../routes/inbox.js";
import { handleTasksList } from "../routes/tasks.js";

// Minimal Hono app for testing — no real FS/DB
const makeApp = (artifactsDir: string, dbPath: string) => {
  const app = new Hono();
  app.get("/api/health", (c) => c.json({ ok: true }));
  app.get("/api/queue", (c) => handleQueueList(c, artifactsDir));
  app.get("/api/queue/live", (c) => handleQueueLive(c, artifactsDir));
  app.get("/api/tasks", (c) => handleTasksList(c, dbPath));
  app.get("/api/inbox", (c) => handleInboxList(c, dbPath));
  app.get("/api/inbox/:id", (c) => handleInboxGet(c, dbPath));
  return app;
};

async function readUntil(res: Response, needle: string, timeoutMs = 3000): Promise<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    const result = await Promise.race<{ value?: Uint8Array; done?: boolean } | "timeout">([
      reader.read(),
      new Promise<"timeout">((r) => setTimeout(() => r("timeout"), remaining)),
    ]);
    if (result === "timeout") break;
    if ((result as { done?: boolean }).done) break;
    const value = (result as { value?: Uint8Array }).value;
    if (value) buf += decoder.decode(value, { stream: true });
    if (buf.includes(needle)) break;
  }
  await reader.cancel().catch(() => undefined);
  return buf;
}

async function readChunk(res: Response, timeoutMs = 1500): Promise<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    const racePromise = Promise.race<{ value?: Uint8Array; done?: boolean } | "timeout">([
      reader.read(),
      new Promise((r) => setTimeout(() => r("timeout"), remaining)),
    ]);
    const result = await racePromise;
    if (result === "timeout") break;
    if (result.done) break;
    if (result.value) buf += decoder.decode(result.value, { stream: true });
    if (buf.length > 0) break;
  }
  await reader.cancel().catch(() => undefined);
  return buf;
}

describe("GET /api/health", () => {
  it("returns 200 { ok: true }", async () => {
    const app = makeApp("/fake/artifacts", "/fake/db.db");
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });
});

describe("GET /api/queue", () => {
  it("returns 500 with message when artifacts dir missing", async () => {
    const app = makeApp("/nonexistent/path/xyz", "/fake/db.db");
    const res = await app.request("/api/queue");
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).toContain("Cannot read");
    expect(text).toContain("Initialize choda-deck first");
  });

  it("returns [] for empty artifacts dir", async () => {
    const { mkdtemp, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const emptyDir = await mkdtemp(join(tmpdir(), "routes-test-"));
    try {
      const app = makeApp(emptyDir, "/fake/db.db");
      const res = await app.request("/api/queue");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual([]);
    } finally {
      await rm(emptyDir, { recursive: true, force: true });
    }
  });
});

describe("GET /api/tasks", () => {
  it("returns 500 with schema error message when DB missing", async () => {
    const app = makeApp("/fake/artifacts", "/nonexistent/db.db");
    const res = await app.request("/api/tasks");
    expect(res.status).toBe(500);
  });
});

describe("GET /api/inbox", () => {
  it("returns 500 when DB missing", async () => {
    const app = makeApp("/fake/artifacts", "/nonexistent/db.db");
    const res = await app.request("/api/inbox");
    expect(res.status).toBe(500);
  });

  it("returns 500 when DB missing (with status filter)", async () => {
    const app = makeApp("/fake/artifacts", "/nonexistent/db.db");
    const res = await app.request("/api/inbox?status=pending,archived");
    expect(res.status).toBe(500);
  });
});

describe("GET /api/inbox/:id", () => {
  it("returns 500 when DB missing", async () => {
    const app = makeApp("/fake/artifacts", "/nonexistent/db.db");
    const res = await app.request("/api/inbox/INBOX-001");
    expect(res.status).toBe(500);
  });
});

describe("GET /api/queue/live", () => {
  it("returns text/event-stream content-type", async () => {
    const { mkdtemp, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = await mkdtemp(join(tmpdir(), "sse-ct-"));
    try {
      const app = makeApp(dir, "/fake/db.db");
      const res = await app.request("/api/queue/live");
      expect(res.headers.get("content-type")).toContain("text/event-stream");
      await res.body?.cancel();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("emits run.active event when active queue exists", async () => {
    const { mkdir, mkdtemp, rm, writeFile } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = await mkdtemp(join(tmpdir(), "sse-active-"));
    try {
      const queueDir = join(dir, "queue-1000000000000-aaa");
      await mkdir(queueDir);
      const startedEvt = {
        event: "task.started",
        queueRunId: "1000000000000-aaa",
        taskId: "TASK-001",
        taskIndex: 1,
      };
      await writeFile(join(queueDir, "queue.jsonl"), JSON.stringify(startedEvt) + "\n");

      const app = makeApp(dir, "/fake/db.db");
      const res = await app.request("/api/queue/live");
      const chunk = await readChunk(res);
      expect(chunk).toContain("event: run.active");
      expect(chunk).toContain("1000000000000-aaa");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("emits run.active mid-stream when active queue appears after connect", async () => {
    const { mkdir, mkdtemp, rm, writeFile } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = await mkdtemp(join(tmpdir(), "sse-midstream-"));
    try {
      const app = makeApp(dir, "/fake/db.db");

      // Connect with no active queue present
      const res = await app.request("/api/queue/live");

      // Create the queue dir 100ms after connect to simulate mid-stream arrival
      setTimeout(() => {
        const queueDir = join(dir, "queue-2000000000000-bbb");
        mkdir(queueDir).then(() =>
          writeFile(
            join(queueDir, "queue.jsonl"),
            JSON.stringify({
              event: "task.started",
              queueRunId: "2000000000000-bbb",
              taskId: "TASK-002",
              taskIndex: 1,
            }) + "\n",
          ),
        );
      }, 100);

      const chunk = await readUntil(res, "run.active", 3000);
      expect(chunk).toContain("event: run.active");
      expect(chunk).toContain("2000000000000-bbb");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
