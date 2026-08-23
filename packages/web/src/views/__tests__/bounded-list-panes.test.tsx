// TASK-1574 AC-5 — guard the bounded-scroll containers against silent removal.
//
// Honest scope: jsdom has no layout engine, so this proves the CLASSES are
// present, not that they work. The behaviour itself (detail in view, image
// naturalWidth > 0, page height bounded) is only provable in a real browser.
// This test exists so a later refactor cannot drop the fix without turning
// something red.
//
// TASK-1623 — rewritten, because it was pinning a mechanism that was measurably
// WRONG. The panes used to bound themselves with
// `max-h-[calc(100vh - <n>rem)]`, five different guesses across eight call
// sites at the same question: "how much chrome is above me?" None was right.
// Measured in a real browser at 1080px tall, the Knowledge panes stopped 183px
// short of the window — the app looked like it refused to use the screen.
//
// The shell now hands each view its exact height and a pane says `flex-1
// min-h-0 overflow-y-auto`. So the assertions moved from the arithmetic to the
// intent: a pane scrolls internally, and it can actually shrink.
//
// The `calc(100vh` assertion is NEW — the old test had nothing stopping a
// return to the guessed-offset approach. That is the regression worth pinning,
// since it is the one that already happened.

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const SRC = join(__dirname, "..", "..");

function source(...rel: string[]): string {
  return readFileSync(join(SRC, ...rel), "utf8");
}

/** The pane may be declared in the view or in the list component it renders. */
function combined(view: string, component: string): string {
  return source("views", view) + "\n" + source("components", component);
}

/**
 * A bounded pane scrolls internally AND can shrink. `min-h-0` is the
 * load-bearing half: without it a flex child refuses to shrink below its
 * content, the inner scroll never engages, and the pane grows the page again —
 * exactly the TASK-1574 failure, reintroduced silently.
 */
function expectBounded(src: string, testid: string): void {
  const marker = `data-testid="${testid}"`;
  const at = src.indexOf(marker);
  expect(at, `no element carrying ${marker}`).toBeGreaterThan(-1);

  // A window around the marker rather than a regex reaching for the "nearest"
  // className — an earlier attribute on a sibling element kept winning that
  // race and the assertion silently graded the wrong element.
  const window = src.slice(Math.max(0, at - 260), at + 260);
  expect(window, `${testid} must scroll internally`).toMatch(/overflow-y-auto/);
  expect(window, `${testid} must be able to shrink (min-h-0)`).toMatch(/min-h-0/);
}

const CASES = [
  { name: "Conversations", view: "ConversationsView.tsx", list: "ConversationList.tsx", prefix: "conversation" },
  { name: "Knowledge", view: "KnowledgeView.tsx", list: "KnowledgeList.tsx", prefix: "knowledge" },
  { name: "Vault", view: "VaultView.tsx", list: "VaultList.tsx", prefix: "vault" },
  // TASK-1749 — the docs browser is a two-pane view like the three above, so it
  // is held to the same contract rather than being trusted to have got it right.
  { name: "Workspace docs", view: "WorkspaceDocsView.tsx", list: "DocTree.tsx", prefix: "workspace-doc" },
] as const;

describe("bounded list/detail panes (TASK-1574)", () => {
  for (const c of CASES) {
    it(`${c.name} bounds the list pane`, () => {
      expectBounded(combined(c.view, c.list), `${c.prefix}-list-pane`);
    });

    it(`${c.name} bounds the detail pane`, () => {
      expectBounded(source("views", c.view), `${c.prefix}-detail-pane`);
    });
  }

  it("no view or component guesses its height from the viewport", () => {
    // The regression this file now exists to prevent. `calc(100vh - <n>rem)`
    // cannot be right: the offset depends on the view, the window size and
    // whether a filter row is showing, and it double-counts the padding of the
    // element it is nested inside.
    const offenders: string[] = [];
    for (const c of CASES) {
      if (/calc\(100vh/.test(source("views", c.view))) offenders.push(c.view);
      if (/calc\(100vh/.test(source("components", c.list))) offenders.push(c.list);
    }
    for (const extra of ["GraphView.tsx"]) {
      if (/calc\(100vh/.test(source("components", extra))) offenders.push(extra);
    }
    expect(offenders, "these files bound themselves against the viewport").toEqual([]);
  });
});
