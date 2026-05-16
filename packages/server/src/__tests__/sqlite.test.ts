import Database from "better-sqlite3";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { queryTasks } from "../data/sqlite.js";

let dir: string;
let dbPath: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sqlite-test-"));
  dbPath = join(dir, "test.db");
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
  db.exec(`INSERT INTO tasks VALUES ('TASK-001','proj-1','Task 1','READY','P2','','["auto-safe","urgent"]','2026-01-01','2026-01-02')`);
  db.exec(`INSERT INTO tasks VALUES ('TASK-002','proj-1','Task 2','READY','P1','','["urgent"]','2026-01-01','2026-01-01')`);
  db.exec(`INSERT INTO tasks VALUES ('TASK-003','proj-1','Task 3','TODO','P3','','["auto-safe"]','2026-01-01','2026-01-01')`);
  db.exec(`INSERT INTO tasks VALUES ('TASK-004','proj-1','Task 4','TODO','P4','',NULL,'2026-01-01','2026-01-01')`);
  db.close();
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("queryTasks — labels filter", () => {
  it("returns all tasks when no label filter", () => {
    const tasks = queryTasks(dbPath, [], undefined, undefined);
    expect(tasks).toHaveLength(4);
  });

  it("returns only auto-safe tasks", () => {
    const tasks = queryTasks(dbPath, [], undefined, ["auto-safe"]);
    const ids = tasks.map((t) => t.id);
    expect(ids).toContain("TASK-001");
    expect(ids).toContain("TASK-003");
    expect(ids).not.toContain("TASK-002");
    expect(ids).not.toContain("TASK-004");
  });

  it("combines status=READY + labels=auto-safe for queue-eligible list", () => {
    const tasks = queryTasks(dbPath, ["READY"], undefined, ["auto-safe"]);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.id).toBe("TASK-001");
  });

  it("OR semantics — returns tasks matching any of the labels", () => {
    const tasks = queryTasks(dbPath, [], undefined, ["auto-safe", "urgent"]);
    const ids = tasks.map((t) => t.id);
    expect(ids).toContain("TASK-001");
    expect(ids).toContain("TASK-002");
    expect(ids).toContain("TASK-003");
    expect(ids).not.toContain("TASK-004");
  });
});
