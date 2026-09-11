// TASK-1937 — the fence reader and the splicer.
//
// This file exists mostly for `replaceFence`. It is the one place in the web
// client that rewrites a document, so it is the one place a CRLF file can be
// silently converted to LF — the defect the whole write path is built to avoid,
// arriving from the client instead of the server.

import { describe, it, expect } from "vitest";
import { fenceAtLine, listMermaidFences, replaceFence } from "../mermaid-fences";

const LF = ["# doc", "", "```mermaid", "sequenceDiagram", "  A->>B: hi", "```", "", "prose", ""].join(
  "\n"
);
const CRLF = LF.split("\n").join("\r\n");

describe("listMermaidFences", () => {
  it("finds the fence and slices its body without the markers", () => {
    const [fence] = listMermaidFences(LF);
    expect(fence!.index).toBe(0);
    expect(fence!.code).toBe("sequenceDiagram\n  A->>B: hi");
    expect(LF.split("\n").slice(fence!.start - 1, fence!.end).join("\n")).toBe(fence!.code);
  });

  it("finds the same fence in a CRLF document", () => {
    // A regex written as /```mermaid\n/ finds nothing here, and the failure is
    // silent: the document simply reports no diagrams.
    expect(listMermaidFences(CRLF)).toHaveLength(1);
    expect(listMermaidFences(CRLF)[0]!.code).toContain("\r");
  });

  it("CONTROL — a document with no fence returns none", () => {
    expect(listMermaidFences("# just prose\n")).toEqual([]);
  });

  it("numbers several fences in document order", () => {
    const two = LF + "\n```mermaid\nflowchart TB\n  X --> Y\n```\n";
    const fences = listMermaidFences(two);
    expect(fences.map((f) => f.index)).toEqual([0, 1]);
    expect(fences[1]!.code).toContain("flowchart");
  });
});

describe("replaceFence", () => {
  it("rewrites only the fence's lines", () => {
    const [fence] = listMermaidFences(LF);
    const next = replaceFence(LF, fence!, "sequenceDiagram\n  A->>C: bye");
    expect(next).toContain("A->>C: bye");
    expect(next).not.toContain("A->>B: hi");
    // Everything around it survives, markers included.
    expect(next.startsWith("# doc")).toBe(true);
    expect(next).toContain("```mermaid");
    expect(next.trimEnd().endsWith("prose")).toBe(true);
  });

  it("keeps a CRLF document CRLF — every line, not just the untouched ones", () => {
    const [fence] = listMermaidFences(CRLF);
    const next = replaceFence(CRLF, fence!, "sequenceDiagram\n  A->>C: bye");
    // The replacement arrives as LF from the editor and must be written in the
    // document's endings. A lone \n anywhere means git reports the file as
    // wholly rewritten and the real edit disappears into the noise.
    expect(next.includes("\n")).toBe(true);
    expect(/[^\r]\n/.test(next)).toBe(false);
    expect(next).toContain("A->>C: bye\r");
  });

  it("CONTROL — an LF document stays LF", () => {
    // Without this, a splicer that always emitted CRLF would pass the test above
    // and corrupt every LF document instead.
    const [fence] = listMermaidFences(LF);
    const next = replaceFence(LF, fence!, "sequenceDiagram\n  A->>C: bye");
    expect(next.includes("\r")).toBe(false);
  });

  it("edits the SECOND of two identical diagrams, not the first", () => {
    // Spliced by line range rather than by string search. Two identical
    // diagrams in one document is not a hypothetical — a before-and-after pair
    // is exactly that — and a search-and-replace would edit the wrong one while
    // looking like it worked.
    const twice =
      "```mermaid\nsequenceDiagram\n  A->>B: hi\n```\n\n```mermaid\nsequenceDiagram\n  A->>B: hi\n```\n";
    const fences = listMermaidFences(twice);
    const next = replaceFence(twice, fences[1]!, "sequenceDiagram\n  A->>B: CHANGED");
    const after = listMermaidFences(next);
    expect(after[0]!.code).toBe("sequenceDiagram\n  A->>B: hi");
    expect(after[1]!.code).toBe("sequenceDiagram\n  A->>B: CHANGED");
  });
});

// Which fence is the picture under the reader's cursor?
//
// Getting this wrong does not fail loudly — it writes to a different diagram
// than the one pointed at. So the two cases that carry this block are the ones
// where a lazier answer LOOKS right: two identical diagrams (text alone cannot
// separate them) and a line map that has drifted (the line alone would happily
// name the neighbour).
describe("fenceAtLine", () => {
  const TWINS = [
    "# before and after",
    "",
    "```mermaid",
    "graph TD; A-->B;",
    "```",
    "",
    "and after the change:",
    "",
    "```mermaid",
    "graph TD; A-->B;",
    "```",
    "",
  ].join("\n");

  it("separates two IDENTICAL diagrams by the line they open on", () => {
    const fences = listMermaidFences(TWINS);
    expect(fences).toHaveLength(2);
    // Line 3 and line 9 are the ```mermaid markers; the body starts after each.
    expect(fenceAtLine(fences, 3, "graph TD; A-->B;")?.index).toBe(0);
    expect(fenceAtLine(fences, 9, "graph TD; A-->B;")?.index).toBe(1);
  });

  it("refuses when the line lands on a fence whose text is different", () => {
    // The drift case: remark counted lines in one string and listMermaidFences
    // in another, so the line now points one fence over. Without the text check
    // this returns a confident, wrong index.
    const fences = listMermaidFences(TWINS);
    expect(fenceAtLine(fences, 3, "graph TD; A-->C;")).toBeNull();
  });

  it("refuses when no fence opens on that line", () => {
    const fences = listMermaidFences(TWINS);
    expect(fenceAtLine(fences, 4, "graph TD; A-->B;")).toBeNull();
  });

  it("matches across CRLF and a trailing newline", () => {
    // The renderer hands back text it has already normalised; the fence keeps
    // its carriage returns verbatim. Those are not differences in the drawing,
    // and treating them as such would drop the button on every CRLF document.
    const fences = listMermaidFences(TWINS.split("\n").join("\r\n"));
    expect(fenceAtLine(fences, 3, "graph TD; A-->B;\n")?.index).toBe(0);
  });
});
