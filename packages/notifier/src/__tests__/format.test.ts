import { describe, expect, it } from "vitest";
import { buildBody, buildPriority, buildTitle, formatCost, formatDuration } from "../format.js";
import type { NotifyPayload } from "../types.js";

describe("formatCost", () => {
  it("renders with 2 decimal places and $ prefix", () => {
    expect(formatCost(0.42)).toBe("$0.42");
    expect(formatCost(1.2)).toBe("$1.20");
    expect(formatCost(0)).toBe("$0.00");
  });

  it("falls back to $0.00 for non-finite", () => {
    expect(formatCost(NaN)).toBe("$0.00");
    expect(formatCost(Infinity)).toBe("$0.00");
  });
});

describe("formatDuration", () => {
  it("renders <60s as Ys (no minute component)", () => {
    expect(formatDuration(500)).toBe("1s"); // rounds to 1
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(59_400)).toBe("59s");
  });

  it("renders >=60s as Xm YYs with zero-padded seconds", () => {
    expect(formatDuration(60_000)).toBe("1m 00s");
    expect(formatDuration(65_000)).toBe("1m 05s");
    expect(formatDuration(192_000)).toBe("3m 12s");
    expect(formatDuration(601_000)).toBe("10m 01s");
  });

  it("falls back to 0s for non-finite / negative", () => {
    expect(formatDuration(NaN)).toBe("0s");
    expect(formatDuration(-100)).toBe("0s");
  });
});

const base: NotifyPayload = {
  status: "finished",
  queueRunId: "queue-abc",
  taskCount: 5,
  totalCostUsd: 0.42,
  durationMs: 192_000,
};

describe("buildTitle", () => {
  it("finished → 'Done · N tasks'", () => {
    expect(buildTitle({ ...base, status: "finished", taskCount: 5 })).toBe("Done · 5 tasks");
  });

  it("failed with failedTaskIndex → 'Failed · task i of N'", () => {
    expect(
      buildTitle({ ...base, status: "failed", taskCount: 5, failedTaskIndex: 3 }),
    ).toBe("Failed · task 3 of 5");
  });

  it("failed without failedTaskIndex → fallback 'Failed · N tasks'", () => {
    expect(
      buildTitle({ ...base, status: "failed", taskCount: 5 }),
    ).toBe("Failed · 5 tasks");
  });

  it("failed with failedTaskIndex=0 treated as missing (fallback)", () => {
    expect(
      buildTitle({ ...base, status: "failed", taskCount: 5, failedTaskIndex: 0 }),
    ).toBe("Failed · 5 tasks");
  });
});

describe("buildBody", () => {
  it("composes cost · duration · queueRunId", () => {
    expect(buildBody(base)).toBe("$0.42 · 3m 12s · queue-abc");
  });

  it("works for sub-minute durations", () => {
    expect(buildBody({ ...base, durationMs: 5_000, totalCostUsd: 0.01 })).toBe(
      "$0.01 · 5s · queue-abc",
    );
  });
});

describe("buildPriority", () => {
  it("finished → '3', failed → '4'", () => {
    expect(buildPriority({ ...base, status: "finished" })).toBe("3");
    expect(buildPriority({ ...base, status: "failed" })).toBe("4");
  });
});
