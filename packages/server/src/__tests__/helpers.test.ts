import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// relativeTime — duplicated from index.html inline script for unit testing
function relativeTime(ts: string | null): string {
  if (!ts) return "";
  const diffMs  = Date.now() - new Date(ts).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr  = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 2) return "yesterday";
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(ts).toISOString().slice(0, 10);
}

// statusIcon mapping — key normalisation (toUpperCase + replace - with _)
function resolveStatusKey(status: string): string {
  const k = status.toUpperCase().replace(/-/g, "_");
  const map: Record<string, string> = {
    TODO: "ti-clock",
    QUEUED: "ti-clock",
    READY: "ti-check",
    IN_PROGRESS: "ti-player-play",
    RUNNING: "ti-player-play",
    DONE: "ti-check",
    FINISHED: "ti-check",
    CANCELLED: "ti-x",
    FAILED: "ti-x",
  };
  return map[k] ?? "ti-clock";
}

const NOW = new Date("2026-05-14T12:00:00Z").getTime();

describe("relativeTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns empty string for null", () => {
    expect(relativeTime(null)).toBe("");
  });

  it("returns 'just now' for <60s", () => {
    expect(relativeTime(new Date(NOW - 0).toISOString())).toBe("just now");
    expect(relativeTime(new Date(NOW - 30_000).toISOString())).toBe("just now");
    expect(relativeTime(new Date(NOW - 59_000).toISOString())).toBe("just now");
  });

  it("returns 'Xm ago' for 60s–59m", () => {
    expect(relativeTime(new Date(NOW - 60_000).toISOString())).toBe("1m ago");
    expect(relativeTime(new Date(NOW - 45 * 60_000).toISOString())).toBe("45m ago");
    expect(relativeTime(new Date(NOW - 59 * 60_000).toISOString())).toBe("59m ago");
  });

  it("returns 'Xh ago' for 1h–23h", () => {
    expect(relativeTime(new Date(NOW - 3_600_000).toISOString())).toBe("1h ago");
    expect(relativeTime(new Date(NOW - 23 * 3_600_000).toISOString())).toBe("23h ago");
  });

  it("returns 'yesterday' for 24h–47h", () => {
    expect(relativeTime(new Date(NOW - 24 * 3_600_000).toISOString())).toBe("yesterday");
    expect(relativeTime(new Date(NOW - 47 * 3_600_000).toISOString())).toBe("yesterday");
  });

  it("returns 'Xd ago' for 2d–6d", () => {
    expect(relativeTime(new Date(NOW - 2 * 86_400_000).toISOString())).toBe("2d ago");
    expect(relativeTime(new Date(NOW - 6 * 86_400_000).toISOString())).toBe("6d ago");
  });

  it("returns YYYY-MM-DD for ≥7d", () => {
    const ts = new Date(NOW - 7 * 86_400_000).toISOString();
    expect(relativeTime(ts)).toBe(ts.slice(0, 10));
    const ts2 = new Date(NOW - 30 * 86_400_000).toISOString();
    expect(relativeTime(ts2)).toBe(ts2.slice(0, 10));
  });
});

describe("statusIcon mapping", () => {
  it.each([
    ["TODO",        "ti-clock"],
    ["QUEUED",      "ti-clock"],
    ["READY",       "ti-check"],
    ["IN-PROGRESS", "ti-player-play"],
    ["RUNNING",     "ti-player-play"],
    ["DONE",        "ti-check"],
    ["FINISHED",    "ti-check"],
    ["CANCELLED",   "ti-x"],
    ["FAILED",      "ti-x"],
  ])("status %s → icon %s", (status, icon) => {
    expect(resolveStatusKey(status)).toBe(icon);
  });
});
