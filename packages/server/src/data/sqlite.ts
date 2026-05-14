import Database from "better-sqlite3";

const SUPPORTED_SCHEMA_MIN = 1;
const SUPPORTED_SCHEMA_MAX = 999;

export interface TaskRow {
  id: string;
  title?: string;
  status: string;
  priority?: string;
  body?: string;
  labels?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export class DbBusyError extends Error {
  constructor() {
    super("Database busy. Retrying...");
  }
}

export class DbSchemaError extends Error {
  constructor(message: string) {
    super(message);
  }
}

function openDb(dbPath: string): Database.Database {
  const db = new Database(dbPath, { readonly: true });
  db.pragma("query_only = 1");

  const journalMode = (db.pragma("journal_mode") as Array<{ journal_mode: string }>)[0]?.journal_mode;
  if (journalMode !== "wal") {
    db.close();
    throw new DbSchemaError(
      `DB mode mismatch — expected WAL, got '${journalMode}'. Core changed journal mode?`,
    );
  }

  const hasSchemaVersion =
    (
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'",
        )
        .get() as { name: string } | undefined
    ) !== undefined;

  if (!hasSchemaVersion) {
    db.close();
    throw new DbSchemaError(
      "Core needs schema_version table — file core task.",
    );
  }

  const versionRow = db
    .prepare("SELECT MAX(version) as v FROM schema_version")
    .get() as { v: number | null } | undefined;
  const version = versionRow?.v ?? 0;

  if (version < SUPPORTED_SCHEMA_MIN || version > SUPPORTED_SCHEMA_MAX) {
    db.close();
    throw new DbSchemaError(
      `DB schema version v${version} unsupported (companion needs v${SUPPORTED_SCHEMA_MIN}–v${SUPPORTED_SCHEMA_MAX}). Run \`choda-deck migrate\` first.`,
    );
  }

  return db;
}

function withRetry<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (err instanceof Error && err.message.includes("SQLITE_BUSY")) {
      try {
        return fn();
      } catch (retryErr) {
        if (retryErr instanceof Error && retryErr.message.includes("SQLITE_BUSY")) {
          throw new DbBusyError();
        }
        throw retryErr;
      }
    }
    throw err;
  }
}

export function queryTasks(dbPath: string, statuses: string[]): TaskRow[] {
  return withRetry(() => {
    const db = openDb(dbPath);
    try {
      if (statuses.length === 0) {
        return db.prepare("SELECT * FROM tasks ORDER BY updated_at DESC").all() as TaskRow[];
      }
      const placeholders = statuses.map(() => "?").join(", ");
      return db
        .prepare(`SELECT * FROM tasks WHERE status IN (${placeholders}) ORDER BY updated_at DESC`)
        .all(...statuses) as TaskRow[];
    } finally {
      db.close();
    }
  });
}

export function getTask(dbPath: string, id: string): TaskRow | undefined {
  return withRetry(() => {
    const db = openDb(dbPath);
    try {
      return db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as TaskRow | undefined;
    } finally {
      db.close();
    }
  });
}
