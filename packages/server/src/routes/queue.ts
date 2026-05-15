import type { Context } from "hono";
import { streamSSE } from "hono/streaming";
import { readFile } from "node:fs/promises";
import {
  ArtifactsDirError,
  QueueRunNotFoundError,
  getQueueRun,
  listQueueRuns,
} from "../data/artifacts.js";
import { pickActiveQueueDir } from "../data/picker.js";

const TERMINAL_EVENTS = new Set(["run.finished", "run.failed"]);
const POLL_MS = 500;
const KEEPALIVE_MS = 15_000;

export async function handleQueueList(c: Context, artifactsDir: string) {
  try {
    const runs = await listQueueRuns(artifactsDir);
    return c.json(runs);
  } catch (err) {
    if (err instanceof ArtifactsDirError) {
      return c.text(err.message, 500);
    }
    throw err;
  }
}

export async function handleQueueGet(c: Context, artifactsDir: string) {
  const id = c.req.param("id")!;
  try {
    const result = await getQueueRun(artifactsDir, id);
    return c.json(result);
  } catch (err) {
    if (err instanceof QueueRunNotFoundError) {
      return c.text(`Queue run not found: ${id}`, 404);
    }
    if (err instanceof ArtifactsDirError) {
      return c.text(err.message, 500);
    }
    throw err;
  }
}

export function handleQueueLive(c: Context, artifactsDir: string) {
  const lastEventIdHeader = c.req.header("Last-Event-ID") ?? "";
  const resumeFrom = /^\d+$/.test(lastEventIdHeader)
    ? parseInt(lastEventIdHeader, 10) + 1
    : 0;

  return streamSSE(c, async (stream) => {
    try {
      await stream.write(": connected\n\n");
      let active = await pickActiveQueueDir(artifactsDir);
      let lastKeepalive = Date.now();

      while (!active && !stream.aborted) {
        const now = Date.now();
        if (now - lastKeepalive >= KEEPALIVE_MS) {
          await stream.write(": keep-alive\n\n");
          lastKeepalive = Date.now();
        }
        await stream.sleep(POLL_MS);
        if (!stream.aborted) {
          active = await pickActiveQueueDir(artifactsDir);
        }
      }

      if (!active || stream.aborted) return;

      await stream.writeSSE({
        event: "run.active",
        data: JSON.stringify({
          queueRunId: active.queueRunId,
          taskCount: active.taskCount,
          startedAt: active.startedAt,
        }),
      });

      let lineIndex = resumeFrom;
      lastKeepalive = Date.now();
      let terminal = false;

      while (!stream.aborted && !terminal) {
        const now = Date.now();
        if (now - lastKeepalive >= KEEPALIVE_MS) {
          await stream.write(": keep-alive\n\n");
          lastKeepalive = Date.now();
        }

        try {
          const content = await readFile(active.jsonlPath, "utf8");
          const lines = content.split("\n").filter((l) => l.trim());

          while (lineIndex < lines.length) {
            const line = lines[lineIndex]!;
            let evt: { event: string };
            try {
              evt = JSON.parse(line) as { event: string };
            } catch {
              lineIndex++;
              continue;
            }

            await stream.writeSSE({
              event: "tick",
              data: line,
              id: String(lineIndex),
            });
            lineIndex++;

            if (TERMINAL_EVENTS.has(evt.event)) {
              terminal = true;
              break;
            }
          }
        } catch {
          // file read error — keep retrying
        }

        if (!terminal && !stream.aborted) {
          await stream.sleep(POLL_MS);
        }
      }
    } catch {
      // stream closed or unexpected error
    }
  });
}
