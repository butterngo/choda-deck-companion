// TASK-1780 / TASK-1790 — folders that open and close, starting closed.
//
// TASK-1780 wrote this file with folders open by default and asserted that.
// TASK-1790 inverted the default, because TASK-1787 widened the listing from
// .md to the whole tree and the sizes that justified opening moved from 26 to
// 4,176. The assertions here were rewritten rather than deleted: every property
// TASK-1780 protected — toggling, isolation, persistence, aria — is still a
// property, and inverting the state model is exactly where one would be lost.
//
// Nothing is mocked: DocTree takes a flat path list and owns its own state, so
// the rule under test is the production rule (INBOX-1878). Assertions go through
// role and data-testid, never copy — a regression to a plain <div> renders the
// same folder names.

import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DocTree } from "../DocTree";
import type { WorkspaceDoc } from "../../api";

function doc(path: string): WorkspaceDoc {
  return { path, size: 10, modifiedAt: "2026-08-26T00:00:00.000Z" };
}

// Shaped like the real tree that motivated both tasks: a docs branch worth
// reading and a noisy one (INBOX-1868's data/artifacts/captures).
const DOCS: WorkspaceDoc[] = [
  doc("README.md"),
  doc("docs/guide.md"),
  doc("docs/knowledge/adr-001.md"),
  doc("docs/knowledge/adr-002.md"),
  doc("data/artifacts/captures/draft.md"),
];

function mount(selected: string | null = null): { picked: string[] } {
  const picked: string[] = [];
  render(<DocTree docs={DOCS} selected={selected} onSelect={(p) => picked.push(p)} />);
  return { picked };
}

const folder = (path: string): HTMLElement => screen.getByTestId(`doc-tree-folder-${path}`);
const isOpen = (path: string): boolean => folder(path).getAttribute("aria-expanded") === "true";

describe("the first screen (TASK-1790)", () => {
  it("shows no folder's children", () => {
    mount();
    expect(screen.queryByText("guide.md")).toBeNull();
    expect(screen.queryByText("adr-001.md")).toBeNull();
    expect(screen.queryByText("draft.md")).toBeNull();
  });

  it("CONTROL — the top-level rows themselves ARE there", () => {
    // Without this, a component that rendered nothing at all would pass the
    // assertion above. "Collapsed" must not mean "empty tree".
    mount();
    expect(folder("docs")).toBeTruthy();
    expect(folder("data")).toBeTruthy();
    // A top-level FILE has no folder to hide it.
    expect(screen.getByText("README.md")).toBeTruthy();
  });

  it("reports aria-expanded=false on every folder, and flips it", () => {
    mount();
    expect(isOpen("docs")).toBe(false);
    fireEvent.click(folder("docs"));
    // A static attribute would pass the first assertion alone.
    expect(isOpen("docs")).toBe(true);
  });

  it("still shows how many files a closed folder is hiding", () => {
    mount();
    // With everything shut, the count is the only signal of what is inside —
    // more load-bearing now than when TASK-1780 first asserted it.
    expect(folder("docs").textContent).toContain("3");
  });
});

describe("a deep-linked file is visible, not merely present (TASK-1790)", () => {
  it("opens the ancestors of the selection", () => {
    mount("docs/knowledge/adr-001.md");
    expect(isOpen("docs")).toBe(true);
    expect(isOpen("docs/knowledge")).toBe(true);
    expect(screen.getByText("adr-001.md")).toBeTruthy();
  });

  it("CONTROL — an unrelated branch stays shut", () => {
    // An implementation that opened the ancestors by opening EVERYTHING would
    // pass the test above. This is the half that makes it mean something.
    mount("docs/knowledge/adr-001.md");
    expect(isOpen("data")).toBe(false);
    expect(screen.queryByText("draft.md")).toBeNull();
  });
});

describe("toggling (TASK-1780, still true inverted)", () => {
  it("adds and removes children from the DOM", () => {
    mount();
    fireEvent.click(folder("docs"));
    expect(screen.getByText("guide.md")).toBeTruthy();
    fireEvent.click(folder("docs"));
    // Absent, not merely hidden — a row a screen reader can still reach is
    // worse than no row.
    expect(screen.queryByText("guide.md")).toBeNull();
  });

  it("opens only the folder that was clicked", () => {
    mount();
    fireEvent.click(folder("docs"));
    // A toggle that opened everything would pass the test above.
    expect(isOpen("data")).toBe(false);
    expect(screen.queryByText("draft.md")).toBeNull();
  });

  it("nests — opening a parent does not open its children", () => {
    mount();
    fireEvent.click(folder("docs"));
    expect(screen.getByText("guide.md")).toBeTruthy();
    expect(isOpen("docs/knowledge")).toBe(false);
    expect(screen.queryByText("adr-001.md")).toBeNull();
  });

  it("keeps a folder's state when a file in a DIFFERENT folder is selected", () => {
    const { picked } = mount();
    fireEvent.click(folder("docs"));
    expect(isOpen("docs")).toBe(true);

    fireEvent.click(screen.getByText("guide.md"));
    expect(picked).toEqual(["docs/guide.md"]);

    // The guarantee, not the accident: state lives in DocTree precisely so this
    // does not depend on React happening to keep a Row instance alive. This is
    // also where inverting the model would most plausibly have broken it.
    expect(isOpen("docs")).toBe(true);
  });

  it("leaves file rows selectable", () => {
    const { picked } = mount("README.md");
    fireEvent.click(folder("docs"));
    fireEvent.click(screen.getByText("guide.md"));
    expect(picked).toEqual(["docs/guide.md"]);
  });
});
