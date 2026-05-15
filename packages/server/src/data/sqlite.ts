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

export function queryInboxItems(dbPath: string, statuses: string[]): InboxItemRow[] {
  return withRetry(() => {
    const db = openDb(dbPath);
    try {
      if (statuses.length === 0) {
        return db.prepare("SELECT * FROM inbox_items ORDER BY updated_at DESC").all() as InboxItemRow[];
      }
      const placeholders = statuses.map(() => "?").join(", ");
      return db
        .prepare(`SELECT * FROM inbox_items WHERE status IN (${placeholders}) ORDER BY updated_at DESC`)
        .all(...statuses) as InboxItemRow[];
    } finally {
      db.close();
    }
  });
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

export function queryConversations(dbPath: string, statuses?: string[]): ConversationRow[] {
  return withRetry(() => {
    const db = openDb(dbPath);
    try {
      const base = `
        SELECT c.*, COUNT(cp.participant_name) AS participant_count
        FROM conversations c
        LEFT JOIN conversation_participants cp ON cp.conversation_id = c.id
      `;
      if (!statuses || statuses.length === 0) {
        return db
          .prepare(`${base} GROUP BY c.id ORDER BY c.created_at DESC`)
          .all() as ConversationRow[];
      }
      const placeholders = statuses.map(() => "?").join(", ");
      return db
        .prepare(`${base} WHERE c.status IN (${placeholders}) GROUP BY c.id ORDER BY c.created_at DESC`)
        .all(...statuses) as ConversationRow[];
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
