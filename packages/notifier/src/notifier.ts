import { promises as fsp, watch as fsWatch, type FSWatcher } from "node:fs";
import path from "node:path";
import { numberOr, parseLine } from "./parser.js";
import { pushNtfy } from "./ntfy.js";
import type { Logger, NotifyPayload, PushFn, QueueEvent } from "./types.js";

export type StartNotifierOpts = {
  artifactsDir: string;
  topic: string;
  ntfyHost?: string;
  /** Override push for tests. Default = real ntfy POST with retry. */
  pushFn?: PushFn;
  log?: Logger;
  /** Periodic re-scan interval for queue dirs created before watcher attaches. */
  rescanIntervalMs?: number;
};

export type NotifierHandle = {
  stop: () => Promise<void>;
  readonly trackedFiles: ReadonlySet<string>;
};

const DEFAULT_NTFY_HOST = "https://ntfy.sh";
const DEFAULT_RESCAN_MS = 5000;

/** Per-file derivation state for failedTaskIndex. Reset on each terminal event. */
type StreamState = {
  taskStartedCount: number;
};

export async function startNotifier(opts: StartNotifierOpts): Promise<NotifierHandle> {
  const ntfyHost = opts.ntfyHost ?? DEFAULT_NTFY_HOST;
  const log: Logger = opts.log ?? ((m) => console.log(m));
  const push: PushFn = opts.pushFn ?? (async (payload) => {
    await pushNtfy(payload, { ntfyHost, topic: opts.topic, log });
  });

  const offsets = new Map<string, number>();
  const streamState = new Map<string, StreamState>();
  const fileWatchers = new Map<string, FSWatcher>();
  let stopped = false;

  function stateFor(filePath: string): StreamState {
    let s = streamState.get(filePath);
    if (!s) {
      s = { taskStartedCount: 0 };
      streamState.set(filePath, s);
    }
    return s;
  }

  function toNotifyPayload(evt: QueueEvent, state: StreamState): NotifyPayload | null {
    if (evt.event === "task.started") {
      state.taskStartedCount += 1;
      return null;
    }
    if (evt.event !== "run.finished" && evt.event !== "run.failed") return null;

    const status: "finished" | "failed" = evt.event === "run.finished" ? "finished" : "failed";
    const payload: NotifyPayload = {
      status,
      queueRunId: typeof evt.queueRunId === "string" ? evt.queueRunId : String(evt.queueRunId ?? ""),
      taskCount: numberOr(evt.taskCount, 0),
      totalCostUsd: numberOr(evt.totalCostUsd, 0),
      durationMs: numberOr(evt.durationMs, 0),
    };
    if (status === "failed") {
      const direct = numberOr(evt.failedTaskIndex, 0);
      const derived = state.taskStartedCount;
      const idx = direct > 0 ? direct : derived > 0 ? derived : 0;
      if (idx > 0) payload.failedTaskIndex = idx;
    }
    // Reset state on terminal event so the same file can host a fresh run.
    state.taskStartedCount = 0;
    return payload;
  }

  async function processFile(filePath: string): Promise<void> {
    if (stopped) return;
    let stat;
    try {
      stat = await fsp.stat(filePath);
    } catch {
      return;
    }
    const prev = offsets.get(filePath) ?? 0;
    if (stat.size === prev) return;
    if (stat.size < prev) {
      offsets.set(filePath, 0);
      streamState.set(filePath, { taskStartedCount: 0 });
    }
    const startAt = offsets.get(filePath) ?? 0;
    const len = stat.size - startAt;
    if (len <= 0) return;

    let fh;
    try {
      fh = await fsp.open(filePath, "r");
      const buf = Buffer.alloc(len);
      await fh.read(buf, 0, len, startAt);
      const text = buf.toString("utf8");

      // Advance offset only through the last newline — keep partial trailing
      // lines unread until they're complete.
      const lastNl = text.lastIndexOf("\n");
      if (lastNl === -1) return;
      const consumable = text.slice(0, lastNl);
      offsets.set(filePath, startAt + Buffer.byteLength(consumable, "utf8") + 1);

      const state = stateFor(filePath);
      for (const line of consumable.split("\n")) {
        if (!line.trim()) continue;
        const evt = parseLine(line);
        if (!evt) {
          log(`[notifier] skip malformed line in ${filePath}`);
          continue;
        }
        const payload = toNotifyPayload(evt, state);
        if (!payload) continue;
        try {
          await push(payload);
          log(`[notifier] pushed ${payload.status} for ${payload.queueRunId}`);
        } catch (err) {
          log(`[notifier] push handler threw: ${(err as Error).message}`);
        }
      }
    } finally {
      await fh?.close();
    }
  }

  function trackFile(filePath: string): void {
    if (fileWatchers.has(filePath)) return;
    offsets.set(filePath, 0);
    streamState.set(filePath, { taskStartedCount: 0 });
    void processFile(filePath);
    try {
      const w = fsWatch(filePath, { persistent: true }, () => {
        void processFile(filePath);
      });
      fileWatchers.set(filePath, w);
    } catch (err) {
      log(`[notifier] watch ${filePath}: ${(err as Error).message}`);
    }
  }

  async function scanArtifactsDir(): Promise<void> {
    let entries;
    try {
      entries = await fsp.readdir(opts.artifactsDir, { withFileTypes: true });
    } catch (err) {
      log(`[notifier] readdir ${opts.artifactsDir}: ${(err as Error).message}`);
      return;
    }
    for (const ent of entries) {
      if (!ent.isDirectory() || !ent.name.startsWith("queue-")) continue;
      const queueJsonl = path.join(opts.artifactsDir, ent.name, "queue.jsonl");
      try {
        await fsp.access(queueJsonl);
        trackFile(queueJsonl);
      } catch {
        // queue.jsonl not yet present — recursive watcher will pick it up later
      }
    }
  }

  await fsp.mkdir(opts.artifactsDir, { recursive: true });
  await scanArtifactsDir();

  let rootWatcher: FSWatcher | null = null;
  try {
    rootWatcher = fsWatch(opts.artifactsDir, { persistent: true, recursive: true }, (_eventType, filename) => {
      if (!filename) return;
      const segs = String(filename).split(/[\\/]/);
      if (segs[0]?.startsWith("queue-") && segs[segs.length - 1] === "queue.jsonl") {
        trackFile(path.join(opts.artifactsDir, ...segs));
      }
    });
  } catch (err) {
    log(`[notifier] recursive watch failed (${(err as Error).message}); relying on periodic rescan`);
  }

  const rescanMs = opts.rescanIntervalMs ?? DEFAULT_RESCAN_MS;
  const rescan = setInterval(() => { void scanArtifactsDir(); }, rescanMs);
  rescan.unref();

  return {
    async stop(): Promise<void> {
      stopped = true;
      clearInterval(rescan);
      for (const w of fileWatchers.values()) {
        try { w.close(); } catch { /* */ }
      }
      fileWatchers.clear();
      try { rootWatcher?.close(); } catch { /* */ }
    },
    get trackedFiles(): ReadonlySet<string> {
      return new Set(offsets.keys());
    },
  };
}
