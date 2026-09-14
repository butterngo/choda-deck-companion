// TASK-1943 — the CLIENT half of a cross-repository agreement.
//
// The twin of choda-deck/src/adapters/companion/fence-agreement.test.ts. Both
// repos check in the same fixture and the same EXPECTED table; either
// implementation drifting reddens its own build.
//
//   authority  choda-deck/src/adapters/companion/mermaid-check.ts
//   copy       packages/web/src/lib/mermaid-fences.ts               <- this one
//
// Why it matters that this side is the COPY: `fenceIndex` in every
// POST /workspace-docs/diagram means the ADAPTER's index. If this file's
// implementation counts fences differently, the reader picks diagram 2 on screen
// and the model is asked about a different one. Nothing errors and nothing logs.
//
// Two mechanisms guard that, and this is only the first:
//   · this test makes a disagreement VISIBLE at build time
//   · the adapter's fence-text precondition makes it IMPOSSIBLE TO ACT ON at
//     runtime, by refusing a request whose text does not match (409)
//
// Neither replaces the other. A build check cannot help a user running an older
// client; a runtime refusal cannot tell a developer which side drifted.
//
// KEEPING THE TWO FILES IN SYNC IS MANUAL. That is the acknowledged cost of the
// chosen option — see docs/reports/task-1943-fence-agreement-decision.md in
// choda-deck. If you change the EXPECTED table here, change it there too, and if
// you cannot say why it moved, the answer is that something drifted.

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { listMermaidFences } from "../mermaid-fences";

/**
 * THE PINNED EXPECTATION — byte-for-byte identical to the adapter's copy.
 *
 * Recorded from what the authority actually answers, not from what it ought to.
 * Fence 4 is an empty fence and yields start 66 > end 65; that looks like a bug
 * and is simply how an empty range is expressed. Pinning the real behaviour is
 * what makes the two sides agree — pinning an idealised version would redden
 * both and prove nothing.
 */
const EXPECTED_FENCES = [
  { index: 0, start: 19, end: 20, code: "flowchart TD\n  A-->B" },
  { index: 1, start: 29, end: 30, code: "  sequenceDiagram\n    A->>B: hi" },
  { index: 2, start: 39, end: 40, code: "flowchart LR\n  X-->Y" },
  {
    index: 3,
    start: 55,
    end: 57,
    code: 'flowchart TD\n  N["the word mermaid inside a label"]\n  N-->M["~~~ not a fence"]',
  },
  { index: 4, start: 66, end: 65, code: "" },
  { index: 5, start: 71, end: 72, code: "flowchart TD\n  LAST-->ONE" },
];

const FIXTURE = path.join(__dirname, "..", "__fixtures__", "fence-agreement.md");

describe("TASK-1943 — cross-repo fence agreement (client side)", () => {
  const markdown = fs.readFileSync(FIXTURE, "utf8");
  const fences = listMermaidFences(markdown);

  it("finds exactly the pinned number of fences", () => {
    expect(fences).toHaveLength(EXPECTED_FENCES.length);
  });

  it("agrees with the adapter on every ordinal, line range and body", () => {
    expect(
      fences.map((f) => ({ index: f.index, start: f.start, end: f.end, code: f.code })),
    ).toEqual(EXPECTED_FENCES);
  });

  it("does not count the ```ts block", () => {
    // The one miscount that does not shift later ordinals — it inserts one, so a
    // reader would edit a TypeScript block believing it was a diagram.
    for (const f of fences) {
      expect(f.code).not.toContain("notADiagram");
    }
  });

  it("the fixture is the one both repos share", () => {
    expect(markdown).toContain("This file is checked into TWO repositories");
    // Counted as opening LINES: the fixture's own prose mentions ```mermaid
    // inside a sentence, and that mention is not a fence. A substring count
    // says 7 where the truth is 6.
    const openers = markdown.split("\n").filter((l) => /^\s*```mermaid\s*\r?$/.test(l));
    expect(openers).toHaveLength(EXPECTED_FENCES.length);
    expect(markdown.match(/```mermaid/g) ?? []).toHaveLength(EXPECTED_FENCES.length + 1);
  });
});
