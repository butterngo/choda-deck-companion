import type { Context } from "hono";
import { existsSync } from "node:fs";
import * as path from "node:path";
import {
  DbBusyError,
  DbSchemaError,
  getTask,
  getWorkspace,
} from "../data/sqlite.js";
import { appendAuditLog } from "../data/audit.js";

const WORKTREE_SEGMENT_RE = /\.worktrees([\\/]|$)/i;

export function isLikelyWorktreePath(absPath: string): boolean {
  if (!absPath) return false;
  return WORKTREE_SEGMENT_RE.test(path.normalize(absPath));
}

export interface SpawnedChild {
  unref(): void;
}

export type SpawnFn = (
  command: string,
  args: string[],
  opts: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    detached: boolean;
    stdio: "ignore";
  },
) => SpawnedChild;

export interface QueueStartDeps {
  dbPath: string;
  cliPath: string;
  dataDir: string;
  auditLogPath: string;
  spawnFn: SpawnFn;
}

interface RequestBody {
  taskId?: string;
  projectId?: string;
  workspaceId?: string;
}

export async function handleQueueStart(
  c: Context,
  deps: QueueStartDeps,
): Promise<Response> {
  let body: RequestBody;
  try {
    body = await c.req.json<RequestBody>();
  } catch {
    return c.json({ error: "invalid JSON body" }, 400);
  }

  const { taskId, projectId, workspaceId } = body;
  if (!taskId || !projectId || !workspaceId) {
    return c.json(
      { error: "missing required field: taskId, projectId, workspaceId all required" },
      400,
    );
  }

  let task, workspace;
  try {
    task = getTask(deps.dbPath, taskId);
    workspace = getWorkspace(deps.dbPath, workspaceId);
  } catch (err) {
    if (err instanceof DbBusyError) return c.text(err.message, 503);
    if (err instanceof DbSchemaError) return c.text(err.message, 500);
    throw err;
  }

  if (!task) return c.json({ error: `task not found: ${taskId}` }, 400);
  if (task.status !== "READY") {
    return c.json(
      { error: `task ${taskId} status is ${task.status}, must be READY` },
      400,
    );
  }
  if (task.project_id && task.project_id !== projectId) {
    return c.json(
      { error: `task ${taskId} belongs to project ${task.project_id}, not ${projectId}` },
      400,
    );
  }
  if (!workspace) {
    return c.json({ error: `workspace not found: ${workspaceId}` }, 400);
  }
  if (workspace.archived_at) {
    return c.json({ error: `workspace ${workspaceId} is archived` }, 400);
  }
  if (workspace.project_id !== projectId) {
    return c.json(
      { error: `workspace ${workspaceId} belongs to project ${workspace.project_id}, not ${projectId}` },
      400,
    );
  }

  if (isLikelyWorktreePath(workspace.cwd)) {
    return c.json(
      { error: `workspace.cwd is a worktree path: ${workspace.cwd} (worktree-of-worktree not supported)` },
      400,
    );
  }

  const worktreesParentDir = `${workspace.cwd}.worktrees`;
  const worktreePath = path.join(worktreesParentDir, taskId);
  if (existsSync(worktreePath)) {
    return c.json(
      { error: `worktree leftover for ${taskId}: ${worktreePath} (run cleanup_worktree_orphans first)` },
      400,
    );
  }

  // Server-generated correlation ID; CLI generates its own internal run id.
  // Mobile uses this for start-ack only and re-polls /api/queue for actual progress.
  const queueRunId = `${Date.now()}-${Math.floor(Math.random() * 1e6).toString(36)}`;

  try {
    const child = deps.spawnFn(
      process.execPath,
      [
        deps.cliPath,
        "queue",
        "start",
        "--workspace",
        workspaceId,
        "--max-tasks",
        "1",
      ],
      {
        cwd: workspace.cwd,
        env: { ...process.env, CHODA_DATA_DIR: deps.dataDir },
        detached: true,
        stdio: "ignore",
      },
    );
    child.unref();
  } catch (err) {
    return c.json(
      { error: `spawn failed: ${err instanceof Error ? err.message : String(err)}` },
      500,
    );
  }

  await appendAuditLog(deps.auditLogPath, {
    action: "queue.start",
    taskId,
    projectId,
    workspaceId,
    source: "mobile",
    queueRunId,
  });

  return c.json({ queueRunId }, 202);
}
