// TASK-1780 — folders that open and close.
//
// Nothing is mocked: DocTree takes a flat path list as a prop and owns its own
// collapse state, so the rule under test is the production rule (INBOX-1878 —
// a mock holding a conditional covers up the logic it stands in for).
//
// Assertions go through role and data-testid rather than copy. A regression to
// a plain <div> would render the same folder names and sail past a text
// assertion, which was never the property worth protecting.

import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DocTree } from "../DocTree";
import type { WorkspaceDoc } from "../../api";

function doc(path: string): WorkspaceDoc {
  return { path, size: 10, modifiedAt: "2026-08-25T00:00:00.000Z" };
}

// Shaped like the real tree that motivated this: two sibling folders, one of
// them the noisy one (INBOX-1868's data/artifacts/captures).
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

describe("DocTree collapse (TASK-1780)", () => {
  it("starts with every folder expanded", () => {
    mount();
    for (const p of ["docs", "docs/knowledge", "data", "data/artifacts"]) {
      expect(folder(p).getAttribute("aria-expanded")).toBe("true");
    }
    expect(screen.getByText("adr-001.md")).toBeTruthy();
  });

  it("removes the children from the DOM when a folder is closed", () => {
    mount();
    expect(screen.getByText("adr-001.md")).toBeTruthy();
    fireEvent.click(folder("docs/knowledge"));
    // Absent, not merely hidden — a row a screen reader can still reach is
    // worse than no row.
    expect(screen.queryByText("adr-001.md")).toBeNull();
    expect(screen.queryByText("adr-002.md")).toBeNull();
  });

  it("closes only the folder that was clicked", () => {
    mount();
    fireEvent.click(folder("docs/knowledge"));
    // The sibling and the parent are untouched — a toggle that collapsed
    // everything would pass the test above.
    expect(screen.getByText("guide.md")).toBeTruthy();
    expect(screen.getByText("draft.md")).toBeTruthy();
    expect(folder("docs").getAttribute("aria-expanded")).toBe("true");
  });

  it("reopens on a second click", () => {
    mount();
    fireEvent.click(folder("docs/knowledge"));
    expect(screen.queryByText("adr-001.md")).toBeNull();
    fireEvent.click(folder("docs/knowledge"));
    expect(screen.getByText("adr-001.md")).toBeTruthy();
  });

  it("keeps a folder closed while a file in a DIFFERENT folder is selected", () => {
    const { picked } = mount();
    fireEvent.click(folder("data"));
    expect(folder("data").getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(screen.getByText("guide.md"));
    expect(picked).toEqual(["docs/guide.md"]);

    // The selection must not reset the tree. This is the guarantee, not the
    // accident: per-row state happens to survive because React keeps the
    // instance, which is a property of the reconciler rather than a decision.
    expect(folder("data").getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("draft.md")).toBeNull();
  });

  it("gives the toggle a real aria-expanded that flips", () => {
    mount();
    const f = folder("docs");
    expect(f.tagName).toBe("BUTTON");
    expect(f.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(f);
    // A static attribute would pass the first assertion alone.
    expect(folder("docs").getAttribute("aria-expanded")).toBe("false");
  });

  it("still says how many files a closed folder is hiding", () => {
    mount();
    fireEvent.click(folder("docs"));
    // 3 = guide.md + the two ADRs. A closed folder that dropped its count
    // would hide both the files and the fact that there are any.
    expect(folder("docs").textContent).toContain("3");
  });

  it("leaves file rows selectable as before", () => {
    const { picked } = mount("README.md");
    fireEvent.click(screen.getByText("guide.md"));
    expect(picked).toEqual(["docs/guide.md"]);
  });
});
