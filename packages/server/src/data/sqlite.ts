import Database from "better-sqlite3";

const SUPPORTED_SCHEMA_MIN = 1;
const SUPPORTED_SCHEMA_MAX = 999;

export interface ProjectRow {
  id: string;
  name: string;
  cwd: string;
}

export interface WorkspaceRow {
  id: string;
  project_id: string;
  label: string;
  cwd: string;
  archived_at?: string | null;
}

export interface TaskRow {
  id: string;
  project_id?: string;
  title?: string;
  status: string;
  priority?: string;
  body?: string;
  labels?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface InboxItemRow {
  id: string;
  project_id?: string;
  content: string;
  status: string;
  linked_task_id?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface ConversationRow {
  id: string;
  project_id?: string;
  title?: string;
  status: string;
  created_by?: string;
  decision_summary?: string;
  created_at?: string;
  decided_at?: string;
  closed_at?: string;
  owner_session_id?: string;
  owner_type?: string;
  participant_count?: number;
  [key: string]: unknown;
}

export interface ConversationThread {
  conversation: ConversationRow;
  participants: Record<string, unknown>[];
  messages: Record<string, unknown>[];
  links: Record<string, unknown>[];
  actions: Record<string, unknown>[];
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

export function queryProjects(dbPath: string): ProjectRow[] {
  return withRetry(() => {
    const db = openDb(dbPath);
    try {
      return db.prepare("SELECT id, name, cwd FROM projects ORDER BY name ASC").all() as ProjectRow[];
    } finally {
      db.close();
    }
  });
}

export function queryWorkspaces(dbPath: string, projectId?: string): WorkspaceRow[] {
  return withRetry(() => {
    const db = openDb(dbPath);
    try {
      if (projectId) {
        return db
          .prepare(
            "SELECT id, project_id, label, cwd, archived_at FROM workspaces WHERE project_id = ? AND archived_at IS NULL ORDER BY label ASC",
          )
          .all(projectId) as WorkspaceRow[];
      }
      return db
        .prepare(
          "SELECT id, project_id, label, cwd, archived_at FROM workspaces WHERE archived_at IS NULL ORDER BY label ASC",
        )
        .all() as WorkspaceRow[];
    } finally {
      db.close();
    }
  });
}

export function queryTasks(
  dbPath: string,
  statuses: string[],
  projectId?: string,
  labels?: string[],
  query?: string,
): TaskRow[] {
  return withRetry(() => {
    const db = openDb(dbPath);
    try {
      const where: string[] = [];
      const params: string[] = [];
      if (statuses.length > 0) {
        where.push(`status IN (${statuses.map(() => "?").join(", ")})`);
        params.push(...statuses);
      }
      if (projectId) {
        where.push("project_id = ?");
        params.push(projectId);
      }
      if (labels && labels.length > 0) {
        const placeholders = labels.map(() => "?").join(", ");
        where.push(`EXISTS (SELECT 1 FROM json_each(labels) WHERE value IN (${placeholders}))`);
        params.push(...labels);
      }
      const trimmed = query?.trim();
      if (trimmed) {
        where.push("(id LIKE ? OR title LIKE ?)");
        const like = `%${trimmed}%`;
        params.push(like, like);
      }
      const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
      return db
        .prepare(`SELECT * FROM tasks ${whereSql} ORDER BY updated_at DESC`)
        .all(...params) as TaskRow[];
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

export function getWorkspace(dbPath: string, id: string): WorkspaceRow | undefined {
  return withRetry(() => {
    const db = openDb(dbPath);
    try {
      return db
        .prepare("SELECT id, project_id, label, cwd, archived_at FROM workspaces WHERE id = ?")
        .get(id) as WorkspaceRow | undefined;
    } finally {
      db.close();
    }
  });
}

export function queryInboxItems(
  dbPath: string,
  statuses: string[],
  projectId?: string,
): InboxItemRow[] {
  return withRetry(() => {
    const db = openDb(dbPath);
    try {
      const where: string[] = [];
      const params: string[] = [];
      if (statuses.length > 0) {
        where.push(`status IN (${statuses.map(() => "?").join(", ")})`);
        params.push(...statuses);
      }
      if (projectId) {
        where.push("project_id = ?");
        params.push(projectId);
      }
      const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
      return db
        .prepare(`SELECT * FROM inbox_items ${whereSql} ORDER BY updated_at DESC`)
        .all(...params) as InboxItemRow[];
    } finally {
      db.close();
    }
  });
}

export function queryConversations(
  dbPath: string,
  statuses: string[],
  projectId?: string,
): ConversationRow[] {
  return withRetry(() => {
    const db = openDb(dbPath);
    try {
      const where: string[] = [];
      const params: string[] = [];
      if (statuses.length > 0) {
        where.push(`c.status IN (${statuses.map(() => "?").join(", ")})`);
        params.push(...statuses);
      }
      if (projectId) {
        where.push("c.project_id = ?");
        params.push(projectId);
      }
      const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
      const sql = `
        SELECT c.*, COUNT(cp.participant_name) AS participant_count
        FROM conversations c
        LEFT JOIN conversation_participants cp ON cp.conversation_id = c.id
        ${whereSql}
        GROUP BY c.id
        ORDER BY c.created_at DESC
      `;
      return db.prepare(sql).all(...params) as ConversationRow[];
    } finally {
      db.close();
    }
  });
}

export function getInboxItem(dbPath: string, id: string): InboxItemRow | undefined {
  return withRetry(() => {
    const db = openDb(dbPath);
    try {
      return db.prepare("SELECT * FROM inbox_items WHERE id = ?").get(id) as InboxItemRow | undefined;
    } finally {
      db.close();
    }
  });
}

export function getConversationThread(dbPath: string, id: string): ConversationThread | undefined {
  return withRetry(() => {
    const db = openDb(dbPath);
    try {
      const conversation = db
        .prepare("SELECT * FROM conversations WHERE id = ?")
        .get(id) as ConversationRow | undefined;
      if (!conversation) return undefined;
      const participants = db
        .prepare("SELECT * FROM conversation_participants WHERE conversation_id = ?")
        .all(id) as Record<string, unknown>[];
      const messages = db
        .prepare("SELECT * FROM conversation_messages WHERE conversation_id = ? ORDER BY created_at ASC")
        .all(id) as Record<string, unknown>[];
      const links = db
        .prepare("SELECT * FROM conversation_links WHERE conversation_id = ?")
        .all(id) as Record<string, unknown>[];
      const actions = db
        .prepare("SELECT * FROM conversation_actions WHERE conversation_id = ? ORDER BY created_at ASC")
        .all(id) as Record<string, unknown>[];
      return { conversation, participants, messages, links, actions };
    } finally {
      db.close();
    }
  });
}
