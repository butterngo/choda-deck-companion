import { buildBody, buildPriority, buildTitle } from "./format.js";
import type { Logger, NotifyPayload } from "./types.js";

export type PushNtfyOpts = {
  ntfyHost: string;
  topic: string;
  retries?: number;
  backoffMs?: number;
  fetchImpl?: typeof fetch;
  log?: Logger;
};

export async function pushNtfy(payload: NotifyPayload, opts: PushNtfyOpts): Promise<boolean> {
  const retries = opts.retries ?? 3;
  const backoff = opts.backoffMs ?? 500;
  const url = `${opts.ntfyHost.replace(/\/+$/, "")}/${opts.topic}`;
  const body = buildBody(payload);
  const title = buildTitle(payload);
  const priority = buildPriority(payload);
  const fetchImpl = opts.fetchImpl ?? fetch;
  const log: Logger = opts.log ?? ((m) => console.warn(m));

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetchImpl(url, {
        method: "POST",
        body,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          Title: title,
          Priority: priority,
        },
      });
      if (res.ok) return true;
      log(`[notifier] ntfy attempt ${attempt} got HTTP ${res.status}`);
    } catch (err) {
      log(`[notifier] ntfy attempt ${attempt} failed: ${(err as Error).message}`);
    }
    if (attempt < retries) {
      await sleep(backoff * attempt);
    }
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
