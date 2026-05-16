import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

export interface QueueRunMeta {
  queueRunId: string;
  startedAt: string;
  endedAt?: string;
  totalCostUsd?: number;
  halted?: boolean;
  tasks?: Array<{ id: string; outcome: string; costUsd?: number }>;
  [key: string]: unknown;
}

export interface QueueRunSummary {
  id: string;
  taskCount: number;
  totalCostUsd: number;
  durationMs: number;
  status: "running" | "finished" | "failed";
  finishedAt: string | null;
}

function inferStatus(meta: QueueRunMeta): "running" | "finished" | "failed" {
  if (!meta.endedAt) return "running";
  if (meta.halted) return "failed";
  return "finished";
}

export async function listQueueRuns(artifactsDir: string): Promise<QueueRunSummary[]> {
  let entries: string[];
  try {
    entries = await readdir(artifactsDir);
  } catch {
    throw new ArtifactsDirError(artifactsDir);
  }

  const queueDirs = entries.filter((e) => e.startsWith("queue-"));
  const results: QueueRunSummary[] = [];

  for (const dir of queueDirs) {
    const metaPath = join(artifactsDir, dir, "queue-run.json");
    try {
      const raw = await readFile(metaPath, "utf8");
      const meta = JSON.parse(raw) as QueueRunMeta;
      const status = inferStatus(meta);
      const startMs = meta.startedAt ? new Date(meta.startedAt).getTime() : 0;
      const endMs = meta.endedAt ? new Date(meta.endedAt).getTime() : Date.now();
      results.push({
        id: dir,
        taskCount: meta.tasks?.length ?? 0,
        totalCostUsd: meta.totalCostUsd ?? 0,
        durationMs: endMs - startMs,
        status,
        finishedAt: meta.endedAt ?? null,
      });
    } catch (err) {
      if (err instanceof ArtifactsDirError) throw err;
      // Dir exists but has no queue-run.json (e.g. only tasks/ subdir) — skip
    }
  }

  // Newest first
  results.sort((a, b) => {
    const aTime = a.finishedAt ?? "0";
    const bTime = b.finishedAt ?? "0";
    return bTime.localeCompare(aTime);
  });

  return results;
}

async function resolveQueueRunDir(artifactsDir: string, id: string): Promise<string> {
  // Accept either the full dir name (e.g. "queue-start-1778944233653-fdq4")
  // or just the stripped queueRunId (e.g. "1778944233653-fdq4"). The active-run
  // SSE event emits the stripped form while listQueueRuns emits the full form.
  const candidates = [id, `queue-start-${id}`, `queue-${id}`];
  for (const candidate of candidates) {
    const dir = join(artifactsDir, candidate);
    try {
      await stat(dir);
      return dir;
    } catch {
      // try next candidate
    }
  }
  throw new QueueRunNotFoundError(id);
}

export async function getQueueRun(
  artifactsDir: string,
  id: string,
): Promise<{ report: string; meta: QueueRunMeta }> {
  const dir = await resolveQueueRunDir(artifactsDir, id);

  const metaPath = join(dir, "queue-run.json");
  const reportPath = join(dir, "report.md");

  let meta: QueueRunMeta;
  let report: string;
  try {
    const raw = await readFile(metaPath, "utf8");
    meta = JSON.parse(raw) as QueueRunMeta;
  } catch {
    throw new QueueRunNotFoundError(id);
  }

  try {
    report = await readFile(reportPath, "utf8");
  } catch {
    report = "";
  }

  return { report, meta };
}

export class ArtifactsDirError extends Error {
  readonly path: string;
  constructor(path: string) {
    super(`Cannot read ${path}. Initialize choda-deck first.`);
    this.path = path;
  }
}

export class QueueRunNotFoundError extends Error {
  readonly id: string;
  constructor(id: string) {
    super(`Queue run not found: ${id}`);
    this.id = id;
  }
}
