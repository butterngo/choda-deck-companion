import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { handleQueueList } from "../routes/queue.js";
import { handleTasksList } from "../routes/tasks.js";

// Minimal Hono app for testing — no real FS/DB
const makeApp = (artifactsDir: string, dbPath: string) => {
  const app = new Hono();
  app.get("/api/health", (c) => c.json({ ok: true }));
  app.get("/api/queue", (c) => handleQueueList(c, artifactsDir));
  app.get("/api/tasks", (c) => handleTasksList(c, dbPath));
  return app;
};

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
