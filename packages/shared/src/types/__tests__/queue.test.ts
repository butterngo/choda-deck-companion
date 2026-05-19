import { describe, expect, it } from "vitest";
import { outcomeTone } from "../queue.js";

describe("outcomeTone", () => {
  it("maps DONE to success", () => {
    expect(outcomeTone("DONE")).toBe("success");
  });

  it("maps FAILED to danger", () => {
    expect(outcomeTone("FAILED")).toBe("danger");
  });

  it("maps SKIPPED_PREFLIGHT to warning", () => {
    expect(outcomeTone("SKIPPED_PREFLIGHT")).toBe("warning");
  });

  it("maps SKIPPED to muted", () => {
    expect(outcomeTone("SKIPPED")).toBe("muted");
  });

  it("is case-insensitive — lowercase variants map identically", () => {
    expect(outcomeTone("done")).toBe("success");
    expect(outcomeTone("failed")).toBe("danger");
    expect(outcomeTone("skipped_preflight")).toBe("warning");
    expect(outcomeTone("skipped")).toBe("muted");
  });

  it("falls back to muted for unknown values", () => {
    expect(outcomeTone("")).toBe("muted");
    expect(outcomeTone("preflight-failed")).toBe("muted");
    expect(outcomeTone("merged")).toBe("muted");
    expect(outcomeTone("ok")).toBe("muted");
  });
});
