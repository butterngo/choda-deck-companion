// TASK-1215 AC-3 — fetchSyncLog wires GET /sync/log with an optional ?limit and
// returns the { events } envelope. Mirrors the fetchLedger contract; the hook
// (use-sync-log) is a thin react-query wrapper over this.
import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchSyncLog, type SyncEvent } from "../api";

const EVENT: SyncEvent = {
  id: 1,
  at: 1000,
  kind: "pull",
  upserted: 2,
  tombstoned: 0,
  pushed: 0,
  conflicts: 0,
  note: null,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ events: [EVENT] }),
  }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("fetchSyncLog", () => {
  it("omits the query string when no limit is given", async () => {
    const fetchFn = stubFetch();
    const res = await fetchSyncLog();
    expect(res.events).toEqual([EVENT]);
    expect(String(fetchFn.mock.calls[0][0])).toMatch(/\/sync\/log$/);
  });

  it("appends ?limit when a limit is given", async () => {
    const fetchFn = stubFetch();
    await fetchSyncLog(25);
    expect(String(fetchFn.mock.calls[0][0])).toMatch(/\/sync\/log\?limit=25$/);
  });

  it("throws on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }))
    );
    await expect(fetchSyncLog()).rejects.toThrow(/HTTP 500/);
  });
});
