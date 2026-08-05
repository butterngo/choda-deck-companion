// TASK-1574 AC-5 — guard the bounded-scroll containers against silent removal.
//
// Honest scope: jsdom has no layout engine, so this proves the CLASSES are
// present, not that they work. The behaviour itself (detail in view, image
// naturalWidth > 0, page height bounded) is only provable in a real browser —
// see the headless harness in the task's Test Plan. This test exists so a later
// refactor cannot drop the fix without turning something red.

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const VIEWS = join(__dirname, "..");

function source(file: string): string {
  return readFileSync(join(VIEWS, file), "utf8");
}

const BOUNDED = /max-h-\[calc\(100vh-\d+rem\)\][\s\S]{0,40}overflow-y-auto/;

describe("bounded list/detail panes (TASK-1574)", () => {
  it("ConversationsView bounds the list pane", () => {
    const src = source("ConversationsView.tsx");
    expect(src).toContain('data-testid="conversation-list-pane"');
    expect(src).toMatch(BOUNDED);
  });

  it("ConversationsView bounds the detail pane", () => {
    expect(source("ConversationsView.tsx")).toContain('data-testid="conversation-detail-pane"');
  });

  it("KnowledgeView bounds the list pane", () => {
    const src = source("KnowledgeView.tsx");
    expect(src).toContain('data-testid="knowledge-list-pane"');
    expect(src).toMatch(BOUNDED);
  });

  it("KnowledgeView bounds the detail pane", () => {
    expect(source("KnowledgeView.tsx")).toContain('data-testid="knowledge-detail-pane"');
  });
});
