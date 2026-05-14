import { describe, expect, it } from "vitest";
import { pushNtfy } from "../ntfy.js";
import type { NotifyPayload } from "../types.js";

const samplePayload: NotifyPayload = {
  status: "finished",
  queueRunId: "queue-abc",
  taskCount: 5,
  totalCostUsd: 0.42,
  durationMs: 192_000,
};

function headerValue(init: RequestInit, key: string): string | undefined {
  const h = init.headers;
  if (!h) return undefined;
  if (h instanceof Headers) return h.get(key) ?? undefined;
  if (Array.isArray(h)) {
    const found = h.find((entry) => entry[0]?.toLowerCase() === key.toLowerCase());
    return found?.[1];
  }
  const rec = h as Record<string, string>;
  const direct = rec[key];
  if (direct !== undefined) return direct;
  const match = Object.keys(rec).find((k) => k.toLowerCase() === key.toLowerCase());
  return match ? rec[match] : undefined;
}

describe("pushNtfy", () => {
  it("POSTs Brief-format plain-text body to <ntfyHost>/<topic> with Title + Priority headers", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fakeFetch: typeof fetch = async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response("ok", { status: 200 });
    };
    const ok = await pushNtfy(samplePayload, {
      ntfyHost: "https://ntfy.sh",
      topic: "my-topic",
      fetchImpl: fakeFetch,
      backoffMs: 1,
      log: () => { /* */ },
    });
    expect(ok).toBe(true);
    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.url).toBe("https://ntfy.sh/my-topic");
    expect(call.init.method).toBe("POST");
    expect(String(call.init.body)).toBe("$0.42 · 3m 12s · queue-abc");
    expect(headerValue(call.init, "Title")).toBe("Done · 5 tasks");
    expect(headerValue(call.init, "Priority")).toBe("3");
    expect(headerValue(call.init, "Tags")).toBeUndefined();
    expect(headerValue(call.init, "Click")).toBeUndefined();
    expect(headerValue(call.init, "Content-Type")).toMatch(/^text\/plain/);
  });

  it("uses Priority 4 + 'Failed · task i of N' for failed with index", async () => {
    let captured: RequestInit | null = null;
    const fakeFetch: typeof fetch = async (_u, init) => {
      captured = init ?? {};
      return new Response("ok", { status: 200 });
    };
    await pushNtfy(
      { ...samplePayload, status: "failed", failedTaskIndex: 2 },
      { ntfyHost: "https://x", topic: "t", fetchImpl: fakeFetch, backoffMs: 1, log: () => { /* */ } },
    );
    expect(headerValue(captured!, "Title")).toBe("Failed · task 2 of 5");
    expect(headerValue(captured!, "Priority")).toBe("4");
  });

  it("never includes task-title or diff in body or headers", async () => {
    let captured: { url: string; init: RequestInit } | null = null;
    const fakeFetch: typeof fetch = async (u, init) => {
      captured = { url: String(u), init: init ?? {} };
      return new Response("ok", { status: 200 });
    };
    await pushNtfy(samplePayload, {
      ntfyHost: "https://x",
      topic: "t",
      fetchImpl: fakeFetch,
      backoffMs: 1,
      log: () => { /* */ },
    });
    const all = `${captured!.url}|${String(captured!.init.body)}|${JSON.stringify(captured!.init.headers)}`;
    expect(all).not.toMatch(/taskTitle|diff|prompt|acceptance/i);
  });

  it("strips trailing slashes from ntfyHost", async () => {
    let url = "";
    const fakeFetch: typeof fetch = async (u) => {
      url = String(u);
      return new Response("ok", { status: 200 });
    };
    await pushNtfy(samplePayload, {
      ntfyHost: "https://ntfy.sh///",
      topic: "t",
      fetchImpl: fakeFetch,
      backoffMs: 1,
      log: () => { /* */ },
    });
    expect(url).toBe("https://ntfy.sh/t");
  });

  it("retries on 5xx then succeeds", async () => {
    let calls = 0;
    const fakeFetch: typeof fetch = async () => {
      calls++;
      if (calls < 2) return new Response("err", { status: 500 });
      return new Response("ok", { status: 200 });
    };
    const ok = await pushNtfy(samplePayload, {
      ntfyHost: "https://x",
      topic: "t",
      fetchImpl: fakeFetch,
      backoffMs: 1,
      log: () => { /* */ },
    });
    expect(ok).toBe(true);
    expect(calls).toBe(2);
  });

  it("returns false after retries exhausted on persistent 5xx", async () => {
    let calls = 0;
    const fakeFetch: typeof fetch = async () => {
      calls++;
      return new Response("err", { status: 500 });
    };
    const ok = await pushNtfy(samplePayload, {
      ntfyHost: "https://x",
      topic: "t",
      retries: 3,
      backoffMs: 1,
      fetchImpl: fakeFetch,
      log: () => { /* */ },
    });
    expect(ok).toBe(false);
    expect(calls).toBe(3);
  });

  it("returns false after retries exhausted on network error", async () => {
    let calls = 0;
    const fakeFetch: typeof fetch = async () => {
      calls++;
      throw new Error("ECONNREFUSED");
    };
    const ok = await pushNtfy(samplePayload, {
      ntfyHost: "https://x",
      topic: "t",
      retries: 3,
      backoffMs: 1,
      fetchImpl: fakeFetch,
      log: () => { /* */ },
    });
    expect(ok).toBe(false);
    expect(calls).toBe(3);
  });
});
