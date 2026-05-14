import { describe, expect, it } from "vitest";
import { parseLine, numberOr } from "../parser.js";

describe("parseLine", () => {
  it("parses a valid event line", () => {
    const evt = parseLine('{"event":"run.finished","queueRunId":"q1"}');
    expect(evt).not.toBeNull();
    expect(evt?.event).toBe("run.finished");
    expect(evt?.queueRunId).toBe("q1");
  });

  it("returns null for empty / whitespace lines", () => {
    expect(parseLine("")).toBeNull();
    expect(parseLine("   \t")).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    expect(parseLine("{not json")).toBeNull();
    expect(parseLine("plain text")).toBeNull();
  });

  it("returns null when event field is missing or non-string", () => {
    expect(parseLine('{"queueRunId":"q1"}')).toBeNull();
    expect(parseLine('{"event":123}')).toBeNull();
  });
});

describe("numberOr", () => {
  it("returns the number for finite numeric input", () => {
    expect(numberOr(0.42, 0)).toBe(0.42);
    expect(numberOr(0, 9)).toBe(0);
  });

  it("coerces numeric strings", () => {
    expect(numberOr("1.5", 0)).toBe(1.5);
  });

  it("returns fallback for nullish / non-numeric / NaN", () => {
    expect(numberOr(undefined, 9)).toBe(9);
    expect(numberOr(null, 9)).toBe(9);
    expect(numberOr("not a num", 9)).toBe(9);
    expect(numberOr(NaN, 9)).toBe(9);
  });
});
