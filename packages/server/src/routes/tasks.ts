import type { Context } from "hono";
import { DbBusyError, DbSchemaError, getTask, queryTasks } from "../data/sqlite.js";

export function handleTasksList(c: Context, dbPath: string) {
  const statusParam = c.req.query("status") ?? "";
  const statuses = statusParam
    ? statusParam.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  try {
    const tasks = queryTasks(dbPath, statuses);
    return c.json(tasks);
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

export function handleTaskGet(c: Context, dbPath: string) {
  const id = c.req.param("id");
  try {
    const task = getTask(dbPath, id);
    if (!task) {
      return c.text(`Task not found: ${id}`, 404);
    }
    return c.json(task);
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
