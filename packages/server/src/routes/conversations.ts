import type { Context } from "hono";
import {
  DbBusyError,
  DbSchemaError,
  getConversationThread,
  queryConversations,
} from "../data/sqlite.js";

function handleDbError(c: Context, err: unknown) {
  if (err instanceof DbBusyError) return c.text(err.message, 503);
  if (err instanceof DbSchemaError) return c.text(err.message, 500);
  throw err;
}

export function handleConversationList(c: Context, dbPath: string) {
  const statusParam = c.req.query("status") ?? "";
  const statuses = statusParam
    ? statusParam.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  try {
    const rows = queryConversations(dbPath, statuses.length ? statuses : undefined);
    return c.json(rows);
  } catch (err) {
    return handleDbError(c, err);
  }
}

export function handleConversationGet(c: Context, dbPath: string) {
  const id = c.req.param("id")!;
  try {
    const thread = getConversationThread(dbPath, id);
    if (!thread) return c.text(`Conversation not found: ${id}`, 404);
    return c.json(thread);
  } catch (err) {
    return handleDbError(c, err);
  }
}
