import { describe, it, expect } from "vitest";
import { relativeTime } from "../relative-time";

const NOW = Date.parse("2026-08-08T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe("relativeTime", () => {
  it("scales the unit with the distance", () => {
    expect(relativeTime(ago(5 * 60_000), NOW)).toBe("5m");
    expect(relativeTime(ago(3 * 3600_000), NOW)).toBe("3h");
    expect(relativeTime(ago(3 * 86400_000), NOW)).toBe("3d");
    expect(relativeTime(ago(14 * 86400_000), NOW)).toBe("2w");
    expect(relativeTime(ago(60 * 86400_000), NOW)).toBe("2mo");
    expect(relativeTime(ago(400 * 86400_000), NOW)).toBe("1y");
  });

  it("never rounds a fresh timestamp down to 0m", () => {
    // "0m ago" reads as broken. A just-written note is 1m.
    expect(relativeTime(ago(2_000), NOW)).toBe("1m");
  });

  it("returns empty rather than guessing on a future or unparseable date", () => {
    // The failure this guards: a clock skew rendering "in 3 days" as "-3d",
    // and a malformed frontmatter date rendering "NaNd".
    expect(relativeTime(new Date(NOW + 86400_000).toISOString(), NOW)).toBe("");
    expect(relativeTime("not a date", NOW)).toBe("");
    expect(relativeTime(null, NOW)).toBe("");
    expect(relativeTime(undefined, NOW)).toBe("");
    expect(relativeTime("", NOW)).toBe("");
  });

  it("accepts a bare date, which is what vault frontmatter carries", () => {
    expect(relativeTime("2026-08-05", NOW)).toBe("3d");
  });
});
