// TASK-1574 AC-5 — guard the bounded-scroll containers against silent removal.
//
// Honest scope: jsdom has no layout engine, so this proves the CLASSES are
// present, not that they work. The behaviour itself (detail in view, image
// naturalWidth > 0, page height bounded) is only provable in a real browser —
// see the headless harness in the task's Test Plan. This test exists so a later
// refactor cannot drop the fix without turning something red.
//
// TASK-1617 — widened to search the view AND its list component. The panes did
// not stop being bounded; the declaration moved into ConversationList and
// VaultList when those lists gained filters. Pinning the *view file* made this
// a location assertion rather than a behaviour one, so it failed on a refactor
// that preserved everything it was written to protect.
//
// Vault is now covered too — it has the same list/detail structure and had no
// guard at all.

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

const BOUNDED = /max-h-\[calc\(100vh-\d+rem\)\][\s\S]{0,60}overflow-y-auto/;

describe("bounded list/detail panes (TASK-1574)", () => {
  const CASES = [
    { name: "Conversations", view: "ConversationsView.tsx", list: "ConversationList.tsx", prefix: "conversation" },
    { name: "Knowledge", view: "KnowledgeView.tsx", list: "KnowledgeList.tsx", prefix: "knowledge" },
    { name: "Vault", view: "VaultView.tsx", list: "VaultList.tsx", prefix: "vault" },
  ] as const;

  for (const c of CASES) {
    it(`${c.name} bounds the list pane`, () => {
      const src = combined(c.view, c.list);
      expect(src).toContain(`data-testid="${c.prefix}-list-pane"`);
      expect(src).toMatch(BOUNDED);
    });

    it(`${c.name} bounds the detail pane`, () => {
      // The detail pane stays in the view in all three.
      const src = source("views", c.view);
      expect(src).toContain(`data-testid="${c.prefix}-detail-pane"`);
      expect(src).toMatch(BOUNDED);
    });
  }
});
