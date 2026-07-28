import { describe, it, expect } from "vitest";
import { normalizeRect, scaleRect } from "../crop";

describe("crop rect math", () => {
  it("normalizeRect handles a drag in any direction", () => {
    expect(normalizeRect(10, 20, 4, 5)).toEqual({ x: 4, y: 5, w: 6, h: 15 });
    expect(normalizeRect(4, 5, 10, 20)).toEqual({ x: 4, y: 5, w: 6, h: 15 });
  });

  it("scaleRect maps displayed pixels to natural pixels", () => {
    // image shown at 400×300 but natural 1600×1200 → 4× scale.
    const r = scaleRect({ x: 10, y: 20, w: 30, h: 40 }, 400, 300, 1600, 1200);
    expect(r).toEqual({ x: 40, y: 80, w: 120, h: 160 });
  });

  it("scaleRect avoids divide-by-zero on a zero-size display", () => {
    const r = scaleRect({ x: 1, y: 1, w: 1, h: 1 }, 0, 0, 100, 100);
    expect(Number.isFinite(r.x)).toBe(true);
    expect(Number.isFinite(r.w)).toBe(true);
  });
});
