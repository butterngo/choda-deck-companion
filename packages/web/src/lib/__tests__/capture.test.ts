import { describe, it, expect } from "vitest";
import { captureFilename, dataUrlToBlob } from "../capture";

describe("capture helpers", () => {
  it("captureFilename is deterministic and zero-padded", () => {
    const d = new Date(2026, 6, 28, 9, 5, 3); // 2026-07-28 09:05:03 (month is 0-based)
    expect(captureFilename(d)).toBe("choda-capture-20260728-090503.png");
  });

  it("dataUrlToBlob roundtrips a PNG data URL to a typed blob", () => {
    // 1x1 transparent PNG.
    const png =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const blob = dataUrlToBlob(png);
    expect(blob.type).toBe("image/png");
    expect(blob.size).toBeGreaterThan(0);
  });

  it("dataUrlToBlob defaults to image/png when mime is absent", () => {
    const blob = dataUrlToBlob("data:,QQ=="); // no mime
    expect(blob.type).toBe("image/png");
  });
});
