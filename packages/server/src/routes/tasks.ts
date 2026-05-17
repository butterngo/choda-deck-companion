import type { Context } from "hono";
import { DbBusyError, DbSchemaError, getTask, queryTasks } from "../data/sqlite.js";

export function handleTasksList(c: Context, dbPath: string) {
  const statusParam = c.req.query("status") ?? "";
  const statuses = statusParam
    ? statusParam.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  const projectId = c.req.query("projectId") || undefined;
  const labelsParam = c.req.query("labels") ?? "";
  const labels = labelsParam
    ? labelsParam.split(",").map((s) => s.trim()).filter(Boolean)
    : undefined;
  const query = c.req.query("query") || undefined;

  try {
    const tasks = queryTasks(dbPath, statuses, projectId, labels, query);
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
  const id = c.req.param("id")!;
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
