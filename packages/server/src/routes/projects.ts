import type { Context } from "hono";
import {
  DbBusyError,
  DbSchemaError,
  queryProjects,
  queryWorkspaces,
} from "../data/sqlite.js";

function handleDbError(c: Context, err: unknown) {
  if (err instanceof DbBusyError) return c.text(err.message, 503);
  if (err instanceof DbSchemaError) return c.text(err.message, 500);
  throw err;
}

export function handleProjectList(c: Context, dbPath: string) {
  try {
    const rows = queryProjects(dbPath);
    return c.json(rows);
  } catch (err) {
    return handleDbError(c, err);
  }
}

export function handleWorkspaceList(c: Context, dbPath: string) {
  const projectId = c.req.query("projectId") || undefined;
  try {
    const rows = queryWorkspaces(dbPath, projectId);
    return c.json(rows);
  } catch (err) {
    return handleDbError(c, err);
  }
}
