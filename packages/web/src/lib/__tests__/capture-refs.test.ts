// TASK-1569 — resolver unit tests. The pass-through cases matter as much as the
// rewrites: over-eager rewriting would break every ordinary link in a body.

import { describe, it, expect } from "vitest";
import {
  isCaptureRef,
  isImageRef,
  normalizeCaptureBody,
  resolveCaptureRef,
  toArtifactsRelative,
} from "../capture-refs";

describe("resolveCaptureRef", () => {
  it("AC-1: maps an artifacts-relative ref to /api/artifacts", () => {
    expect(resolveCaptureRef("captures/x.png")).toBe("/api/artifacts/captures/x.png");
  });

  it("AC-2: maps a legacy absolute Windows path to the same URL", () => {
    expect(resolveCaptureRef("C:\\dev\\choda-deck\\data\\artifacts\\captures\\x.png")).toBe(
      "/api/artifacts/captures/x.png",
    );
  });

  it("AC-3: maps a legacy POSIX absolute path to the same URL", () => {
    expect(resolveCaptureRef("/home/u/data/artifacts/captures/x.png")).toBe(
      "/api/artifacts/captures/x.png",
    );
  });

  it("resolves a nested discovery-session path", () => {
    expect(resolveCaptureRef("captures/discovery-abc123/timeline.jsonl")).toBe(
      "/api/artifacts/captures/discovery-abc123/timeline.jsonl",
    );
  });

  it("AC-4: passes non-capture refs through byte-identical", () => {
    for (const ref of [
      "https://example.com/a.png",
      "http://example.com/captures/a.png", // contains the segment but is external
      "./rel.md",
      "../other/doc.md",
      "#anchor",
      "",
    ]) {
      expect(resolveCaptureRef(ref)).toBe(ref);
    }
  });

  it("does not double-rewrite an already-resolved URL", () => {
    const url = "/api/artifacts/captures/x.png";
    expect(resolveCaptureRef(url)).toBe(url);
  });

  it("percent-encodes each segment but keeps the separators structural", () => {
    expect(resolveCaptureRef("captures/my shot (1).png")).toBe(
      "/api/artifacts/captures/my%20shot%20(1).png",
    );
  });

  it("treats a bare `captures/` with no filename as not a capture ref", () => {
    expect(toArtifactsRelative("captures/")).toBeNull();
    expect(isCaptureRef("captures/")).toBe(false);
  });
});

describe("isImageRef", () => {
  it("AC-6: image extensions render as images", () => {
    for (const ext of ["png", "jpg", "jpeg", "webp", "gif"]) {
      expect(isImageRef(`captures/x.${ext}`), ext).toBe(true);
    }
  });

  it("AC-5: non-image artifacts are not images", () => {
    for (const ext of ["har", "json", "jsonl", "md", "txt", "html", "css"]) {
      expect(isImageRef(`captures/x.${ext}`), ext).toBe(false);
    }
  });

  it("is case-insensitive and ignores a query string", () => {
    expect(isImageRef("captures/X.PNG")).toBe(true);
    expect(isImageRef("captures/x.png?v=2")).toBe(true);
  });
});

describe("normalizeCaptureBody", () => {
  it("rewrites a legacy backslash destination before markdown can eat it", () => {
    const body = "![capture](C:\\dev\\choda-deck\\data\\artifacts\\captures\\ab12.png)";
    expect(normalizeCaptureBody(body)).toBe("![capture](captures/ab12.png)");
  });

  it("rewrites a legacy POSIX destination", () => {
    expect(normalizeCaptureBody("[har](/home/u/data/artifacts/captures/b1.har)")).toBe(
      "[har](captures/b1.har)",
    );
  });

  it("leaves an already-relative destination alone", () => {
    const body = "![capture](captures/ab12.png)";
    expect(normalizeCaptureBody(body)).toBe(body);
  });

  it("leaves non-capture links character-for-character", () => {
    const body = "see [docs](https://example.com/a) and [rel](./x.md)\n\nSource: http://ex.com/p";
    expect(normalizeCaptureBody(body)).toBe(body);
  });
});
