import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const TERMINAL_EVENTS = new Set(["run.finished", "run.failed"]);
const ACTIVE_WINDOW_MS = 30 * 60 * 1000;

export interface ActiveRunInfo {
  dirPath: string;
  queueRunId: string;
  startedAt: string;
  taskCount: number;
  jsonlPath: string;
  lineCount: number;
}

function parseQueueRunId(dirName: string): string {
  if (dirName.startsWith("queue-start-")) return dirName.slice("queue-start-".length);
  if (dirName.startsWith("queue-")) return dirName.slice("queue-".length);
  return dirName;
}

function parseStartedAt(dirName: string): string {
  const runId = parseQueueRunId(dirName);
  const tsStr = runId.split("-")[0];
  if (tsStr && /^\d+$/.test(tsStr)) {
    const ts = parseInt(tsStr, 10);
    if (ts > 0) return new Date(ts).toISOString();
  }
  return new Date().toISOString();
}

export async function pickActiveQueueDir(
  artifactsDir: string,
): Promise<ActiveRunInfo | null> {
  let entries: string[];
  try {
    entries = await readdir(artifactsDir);
  } catch {
    return null;
  }

  const queueDirs = entries.filter((e) => e.startsWith("queue-"));
  const candidates: Array<ActiveRunInfo & { mtimeMs: number }> = [];

  for (const dirName of queueDirs) {
    const jsonlPath = join(artifactsDir, dirName, "queue.jsonl");
    try {
      const fileStat = await stat(jsonlPath);
      if (Date.now() - fileStat.mtimeMs > ACTIVE_WINDOW_MS) continue;

      const content = await readFile(jsonlPath, "utf8");
      const lines = content.split("\n").filter((l) => l.trim());
      if (!lines.length) continue;

      const lastLine = lines[lines.length - 1]!;
      let lastEvent: { event: string };
      try {
        lastEvent = JSON.parse(lastLine) as { event: string };
      } catch {
        continue;
      }
      if (TERMINAL_EVENTS.has(lastEvent.event)) continue;

      // Prefer queueRunId from the first JSONL event
      let queueRunId = parseQueueRunId(dirName);
      try {
        const firstEvt = JSON.parse(lines[0]!) as { queueRunId?: string };
        if (firstEvt.queueRunId) queueRunId = firstEvt.queueRunId;
      } catch {
        // fallback to dir-derived id
      }

      const taskCount = lines.reduce((n, l) => {
        try {
          return (JSON.parse(l) as { event: string }).event === "task.started" ? n + 1 : n;
        } catch {
          return n;
        }
      }, 0);

      candidates.push({
        dirPath: join(artifactsDir, dirName),
        queueRunId,
        startedAt: parseStartedAt(dirName),
        taskCount,
        jsonlPath,
        lineCount: lines.length,
        mtimeMs: fileStat.mtimeMs,
      });
    } catch {
      // skip dirs without valid queue.jsonl
    }
  }

  if (!candidates.length) return null;

  // Newest by mtime
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const best = candidates[0]!;
  return {
    dirPath: best.dirPath,
    queueRunId: best.queueRunId,
    startedAt: best.startedAt,
    taskCount: best.taskCount,
    jsonlPath: best.jsonlPath,
    lineCount: best.lineCount,
  };
}
