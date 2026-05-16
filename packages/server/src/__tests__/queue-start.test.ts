import Database from "better-sqlite3";
import { Hono } from "hono";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  handleQueueStart,
  isLikelyWorktreePath,
  type SpawnFn,
} from "../routes/queue-start.js";

let dir: string;
let dbPath: string;
let auditLogPath: string;
let cliPath: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "queue-start-test-"));
  dbPath = join(dir, "test.db");
  auditLogPath = join(dir, "audit.log");
  cliPath = join(dir, "fake-cli.cjs");

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(`CREATE TABLE schema_version (version INTEGER NOT NULL)`);
  db.exec(`INSERT INTO schema_version VALUES (1)`);
  db.exec(`
    CREATE TABLE tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      title TEXT,
      status TEXT NOT NULL,
      priority TEXT,
      body TEXT,
      labels TEXT,
      created_at TEXT,
      updated_at TEXT
    )
  `);
  db.exec(`
    CREATE TABLE workspaces (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      label TEXT NOT NULL,
      cwd TEXT NOT NULL,
      archived_at TEXT
    )
  `);
  db.exec(
    `INSERT INTO tasks VALUES ('TASK-100','proj-1','Ready task','READY','medium','','["auto-safe"]','2026-01-01','2026-01-02')`,
  );
  db.exec(
    `INSERT INTO tasks VALUES ('TASK-101','proj-1','Todo task','TODO','medium','','["auto-safe"]','2026-01-01','2026-01-02')`,
  );
  // Use forward slashes so cwd is portable across OSes; workspace cwd lives under tmp dir.
  const wsClean = join(dir, "ws-clean").replace(/\\/g, "/");
  const wsWorktree = join(dir, "parent.worktrees", "ws-wt").replace(/\\/g, "/");
  const wsArchived = join(dir, "ws-archived").replace(/\\/g, "/");
  db.exec(
    `INSERT INTO workspaces VALUES ('ws-clean','proj-1','Clean','${wsClean}',NULL)`,
  );
  db.exec(
    `INSERT INTO workspaces VALUES ('ws-wt','proj-1','Worktree','${wsWorktree}',NULL)`,
  );
  db.exec(
    `INSERT INTO workspaces VALUES ('ws-archived','proj-1','Archived','${wsArchived}','2026-01-15')`,
  );
  db.close();
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

interface SpawnCall {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  detached: boolean;
}

function makeApp(spawnFn: SpawnFn) {
  const app = new Hono();
  app.post("/api/queue/start", (c) =>
    handleQueueStart(c, {
      dbPath,
      cliPath,
      dataDir: dir,
      auditLogPath,
      spawnFn,
    }),
  );
  return app;
}

function neverSpawn(): SpawnFn {
  return () => {
    throw new Error("spawn should not be called in this test");
  };
}

function recordingSpawn(): { calls: SpawnCall[]; fn: SpawnFn } {
  const calls: SpawnCall[] = [];
  const fn: SpawnFn = (command, args, opts) => {
    calls.push({
      command,
      args,
      cwd: opts.cwd,
      env: opts.env,
      detached: opts.detached,
    });
    return { unref: () => {} };
  };
  return { calls, fn };
}

async function post(app: Hono, body: unknown): Promise<Response> {
  return app.request("/api/queue/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("isLikelyWorktreePath", () => {
  it("detects .worktrees segment in path", () => {
    expect(isLikelyWorktreePath("C:\\dev\\foo.worktrees\\TASK-1")).toBe(true);
    expect(isLikelyWorktreePath("/home/x/foo.worktrees/TASK-1")).toBe(true);
    expect(isLikelyWorktreePath("C:\\dev\\foo")).toBe(false);
    expect(isLikelyWorktreePath("")).toBe(false);
  });
});

describe("POST /api/queue/start — validation", () => {
  it("400 when body is not JSON", async () => {
    const app = makeApp(neverSpawn());
    const res = await app.request("/api/queue/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not-json",
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid JSON body" });
  });

  it("400 when taskId missing", async () => {
    const app = makeApp(neverSpawn());
    const res = await post(app, { projectId: "proj-1", workspaceId: "ws-clean" });
    expect(res.status).toBe(400);
  });

  it("400 when projectId missing", async () => {
    const app = makeApp(neverSpawn());
    const res = await post(app, { taskId: "TASK-100", workspaceId: "ws-clean" });
    expect(res.status).toBe(400);
  });

  it("400 when workspaceId missing", async () => {
    const app = makeApp(neverSpawn());
    const res = await post(app, { taskId: "TASK-100", projectId: "proj-1" });
    expect(res.status).toBe(400);
  });

  it("400 when task not found", async () => {
    const app = makeApp(neverSpawn());
    const res = await post(app, {
      taskId: "TASK-999",
      projectId: "proj-1",
      workspaceId: "ws-clean",
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain("task not found");
  });

  it("400 when task status is not READY", async () => {
    const app = makeApp(neverSpawn());
    const res = await post(app, {
      taskId: "TASK-101",
      projectId: "proj-1",
      workspaceId: "ws-clean",
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain("must be READY");
  });

  it("400 when workspace not found", async () => {
    const app = makeApp(neverSpawn());
    const res = await post(app, {
      taskId: "TASK-100",
      projectId: "proj-1",
      workspaceId: "ws-missing",
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain("workspace not found");
  });

  it("400 when workspace is archived", async () => {
    const app = makeApp(neverSpawn());
    const res = await post(app, {
      taskId: "TASK-100",
      projectId: "proj-1",
      workspaceId: "ws-archived",
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain("archived");
  });

  it("400 when workspace.cwd is a worktree", async () => {
    const app = makeApp(neverSpawn());
    const res = await post(app, {
      taskId: "TASK-100",
      projectId: "proj-1",
      workspaceId: "ws-wt",
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain("worktree-of-worktree not supported");
  });

  it("400 when worktree leftover exists for this task", async () => {
    await mkdir(join(dir, "ws-clean.worktrees", "TASK-100"), { recursive: true });
    const app = makeApp(neverSpawn());
    const res = await post(app, {
      taskId: "TASK-100",
      projectId: "proj-1",
      workspaceId: "ws-clean",
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain("worktree leftover");
  });
});

describe("POST /api/queue/start — happy path", () => {
  it("202 with queueRunId, spawns CLI, writes audit log", async () => {
    const { calls, fn } = recordingSpawn();
    const app = makeApp(fn);
    const res = await post(app, {
      taskId: "TASK-100",
      projectId: "proj-1",
      workspaceId: "ws-clean",
    });
    expect(res.status).toBe(202);

    const json = (await res.json()) as { queueRunId: string };
    expect(json.queueRunId).toMatch(/^\d+-[0-9a-z]+$/);

    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.command).toBe(process.execPath);
    expect(call.args).toEqual([
      cliPath,
      "queue",
      "start",
      "--workspace",
      "ws-clean",
      "--max-tasks",
      "1",
    ]);
    expect(call.cwd).toBe(join(dir, "ws-clean").replace(/\\/g, "/"));
    expect(call.env["CHODA_DATA_DIR"]).toBe(dir);
    expect(call.detached).toBe(true);

    const auditContent = await readFile(auditLogPath, "utf8");
    const auditLine = JSON.parse(auditContent.trim());
    expect(auditLine.action).toBe("queue.start");
    expect(auditLine.taskId).toBe("TASK-100");
    expect(auditLine.projectId).toBe("proj-1");
    expect(auditLine.workspaceId).toBe("ws-clean");
    expect(auditLine.source).toBe("mobile");
    expect(auditLine.queueRunId).toBe(json.queueRunId);
    expect(auditLine.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
