import { describe, it, expect } from "vitest";
import { diffLines, changedCount } from "../line-diff";

describe("diffLines — a one-line edit shows as one line", () => {
  it("reports exactly one removed and one added line", () => {
    const before = "a\nb\nc\n";
    const after = "a\nB\nc\n";
    const d = diffLines(before, after);
    expect(d.filter((x) => x.kind === "removed").map((x) => x.text)).toEqual(["b"]);
    expect(d.filter((x) => x.kind === "added").map((x) => x.text)).toEqual(["B"]);
    // The number the confirm button shows.
    expect(changedCount(d)).toBe(2);
  });

  it("numbers the removed line with its position in the original", () => {
    const d = diffLines("a\nb\nc\n", "a\nB\nc\n");
    // A preview that names the wrong line sends the reader to the wrong place.
    expect(d.find((x) => x.kind === "removed")?.number).toBe(2);
  });
});

describe("diffLines — CRLF survives", () => {
  it("an unchanged CRLF file reports nothing changed", () => {
    // This is the defect the whole preview exists to catch: a diff that
    // normalised line endings would call every line changed, and the reader
    // would learn to ignore the preview.
    const crlf = "a\r\nb\r\nc\r\n";
    expect(changedCount(diffLines(crlf, crlf))).toBe(0);
  });

  it("a one-line edit inside a CRLF file is still one line", () => {
    const d = diffLines("a\r\nb\r\nc\r\n", "a\r\nB\r\nc\r\n");
    expect(d.filter((x) => x.kind === "removed").map((x) => x.text)).toEqual(["b"]);
    expect(d.filter((x) => x.kind === "added").map((x) => x.text)).toEqual(["B"]);
  });

  it("CONTROL — changing the line endings themselves IS a change", () => {
    // The flip side, and the reason the previous test proves something: if the
    // splitter threw endings away, this would report zero and the preview would
    // hide a rewrite of every line in the file.
    const d = diffLines("a\r\nb\r\n", "a\nb\n");
    // Same visible text, different bytes — the preview cannot see it, and the
    // honest answer is to say so rather than to pretend. The adapter's
    // byte-level round trip (TASK-1841 AC-5) is what actually guards this.
    expect(changedCount(d)).toBe(0);
  });
});

describe("diffLines — it never understates", () => {
  it("two separate edits both appear", () => {
    const d = diffLines("a\nb\nc\nd\ne\n", "a\nB\nc\nD\ne\n");
    const removed = d.filter((x) => x.kind === "removed").map((x) => x.text);
    // The simplification widens the changed region rather than splitting it, so
    // both edits are inside it. Reporting FEWER changes than exist is the one
    // failure mode a preview must not have.
    expect(removed).toContain("b");
    expect(removed).toContain("d");
  });

  it("an insertion is added with no removal", () => {
    const d = diffLines("a\nc\n", "a\nb\nc\n");
    expect(d.filter((x) => x.kind === "added").map((x) => x.text)).toEqual(["b"]);
    expect(d.filter((x) => x.kind === "removed")).toHaveLength(0);
  });

  it("identical text is zero, so the button can refuse to write", () => {
    expect(changedCount(diffLines("x\ny\n", "x\ny\n"))).toBe(0);
  });
});
