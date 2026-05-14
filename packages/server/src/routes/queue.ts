import type { Context } from "hono";
import { ArtifactsDirError, QueueRunNotFoundError, getQueueRun, listQueueRuns } from "../data/artifacts.js";

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
  const id = c.req.param("id");
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
