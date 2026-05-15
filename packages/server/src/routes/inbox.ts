import type { Context } from "hono";
import { DbBusyError, DbSchemaError, getInboxItem, queryInboxItems } from "../data/sqlite.js";

export function handleInboxList(c: Context, dbPath: string) {
  const statusParam = c.req.query("status") ?? "";
  const statuses = statusParam
    ? statusParam.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  try {
    const items = queryInboxItems(dbPath, statuses);
    return c.json(items);
  } catch (err) {
    if (err instanceof DbBusyError) {
      return c.text(err.message, 503);
    }
    if (err instanceof DbSchemaError) {
      return c.text(err.message, 500);
    }
    throw err;
  }
}

export function handleInboxGet(c: Context, dbPath: string) {
  const id = c.req.param("id")!;
  try {
    const item = getInboxItem(dbPath, id);
    if (!item) {
      return c.text(`Inbox item not found: ${id}`, 404);
    }
    return c.json(item);
  } catch (err) {
    if (err instanceof DbBusyError) {
      return c.text(err.message, 503);
    }
    if (err instanceof DbSchemaError) {
      return c.text(err.message, 500);
    }
    throw err;
  }
}
