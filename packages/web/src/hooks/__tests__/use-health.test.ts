import { describe, it, expect } from "vitest";
import { deriveConn, STALE_AFTER_MS } from "../use-health";

const NOW = 1_000_000;

describe("deriveConn", () => {
  it("error → disconnected", () => {
    expect(deriveConn(true, true, NOW, NOW)).toBe("disconnected");
  });

  it("no data yet → disconnected", () => {
    expect(deriveConn(false, false, null, NOW)).toBe("disconnected");
  });

  it("fresh data → connected", () => {
    expect(deriveConn(false, true, NOW - 5_000, NOW)).toBe("connected");
  });

  it("data older than the stale window → stale", () => {
    expect(deriveConn(false, true, NOW - (STALE_AFTER_MS + 1), NOW)).toBe("stale");
  });
});
