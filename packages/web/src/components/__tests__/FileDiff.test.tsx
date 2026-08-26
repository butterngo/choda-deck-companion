// TASK-1792 — the changed lines of one file, and the three different reasons
// there might not be any.
//
// Those three are the point of this file. "No diff available" would be one
// message covering three unrelated facts: an adapter too old to serve diffs,
// a file that has no text to diff, and a file that genuinely did not move.
// Each has its own test AND its own control, because a component that rendered
// one message always would pass whichever half was written first.

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { FileDiff, firstChangedLine } from "../FileDiff";
import type { CommitFileStat, DiffHunk } from "../../api";

const HUNK: DiffHunk = {
  oldStart: 157,
  oldLines: 9,
  newStart: 157,
  newLines: 12,
  header: "async function collectAdrs(",
  lines: [
    { kind: "ctx", text: "  const decisions = await svc.list()", oldNo: 157, newNo: 157 },
    { kind: "ctx", text: "  const adrs = []", oldNo: 158, newNo: 158 },
    { kind: "ctx", text: "  for (const item of decisions) {", oldNo: 159, newNo: 159 },
    { kind: "add", text: "    // TASK-1785 — the SOURCE read", oldNo: null, newNo: 160 },
    { kind: "add", text: "    // per ref and nothing below reads it", oldNo: null, newNo: 161 },
    { kind: "del", text: "    let entry = null", oldNo: 160, newNo: null },
    { kind: "ctx", text: "  }", oldNo: 161, newNo: 162 },
  ],
};

function file(over: Partial<CommitFileStat> = {}): CommitFileStat {
  return {
    path: "src/adapters/companion/task-provenance.ts",
    insertions: 2,
    deletions: 1,
    binary: false,
    hunks: [HUNK],
    ...over,
  };
}

function mount(f: CommitFileStat): void {
  render(
    <MemoryRouter>
      <FileDiff file={f} workspaceId="main" />
    </MemoryRouter>,
  );
}

describe("rendering the lines (AC-1)", () => {
  it("distinguishes added, removed and context", () => {
    mount(file());
    expect(screen.getAllByTestId("diff-line-add")).toHaveLength(2);
    expect(screen.getAllByTestId("diff-line-del")).toHaveLength(1);
    expect(screen.getAllByTestId("diff-line-ctx")).toHaveLength(4);
  });

  it("carries the real file line numbers, continuing across the hunk", () => {
    mount(file());
    const adds = screen.getAllByTestId("diff-line-add");
    // 160 and 161 — the numbers these lines have in the file, not offsets
    // within the hunk. Numbers that restarted per hunk would look fine here
    // and send a reader to the wrong place in a long file.
    expect(adds[0]?.getAttribute("data-new-no")).toBe("160");
    expect(adds[1]?.getAttribute("data-new-no")).toBe("161");
  });

  it("gives an added line no OLD number and a removed line no NEW one", () => {
    mount(file());
    expect(screen.getAllByTestId("diff-line-add")[0]?.getAttribute("data-old-no")).toBeNull();
    expect(screen.getAllByTestId("diff-line-del")[0]?.getAttribute("data-new-no")).toBeNull();
    // A context line has both, and they are what tie the two columns together.
    const ctx = screen.getAllByTestId("diff-line-ctx")[0];
    expect(ctx?.getAttribute("data-old-no")).toBe("157");
    expect(ctx?.getAttribute("data-new-no")).toBe("157");
  });

  it("shows the hunk header git provided", () => {
    mount(file());
    expect(screen.getByTestId("diff-hunk-header").textContent).toContain("collectAdrs");
  });
});

describe("opening the file at the line (AC-3)", () => {
  it("links to the first ADDED line", () => {
    mount(file());
    const link = screen.getByTestId("file-open-src/adapters/companion/task-provenance.ts");
    expect(link.getAttribute("href")).toContain("line=160");
    expect(link.getAttribute("href")).toContain("path=src%2Fadapters%2Fcompanion%2Ftask-provenance.ts");
  });

  it("falls back to the hunk start when nothing was added", () => {
    // A pure deletion has no line in the new file to land on. The hunk start
    // is where the removal happened; no destination at all would be worse.
    const delOnly: DiffHunk = {
      ...HUNK,
      lines: [{ kind: "del", text: "gone", oldNo: 157, newNo: null }],
    };
    expect(firstChangedLine(file({ hunks: [delOnly] }))).toBe(157);
  });

  it("is null when there is no patch to point into", () => {
    expect(firstChangedLine(file({ hunks: null }))).toBeNull();
    expect(firstChangedLine(file({ hunks: undefined }))).toBeNull();
  });
});

describe("the three different absences", () => {
  it("an OLD ADAPTER says the diff is unavailable, not that nothing changed (AC-6)", () => {
    mount(file({ hunks: undefined }));
    const note = screen.getByTestId("diff-unsupported-src/adapters/companion/task-provenance.ts");
    expect(note.textContent).toContain("adapter");
    // The counts are still exact and still shown — this is a gap in the
    // adapter, not in the commit.
    expect(screen.getByText("+2")).toBeTruthy();
  });

  it("a BINARY file says it has no lines, distinctly from the above (AC-5)", () => {
    mount(file({ hunks: null, omitted: "binary", binary: true, insertions: null, deletions: null }));
    expect(
      screen.getByTestId("diff-omitted-src/adapters/companion/task-provenance.ts").textContent,
    ).toContain("Not text");
    expect(
      screen.queryByTestId("diff-unsupported-src/adapters/companion/task-provenance.ts"),
    ).toBeNull();
  });

  it("an OVERSIZED file says so, distinctly from binary (AC-7)", () => {
    mount(file({ hunks: null, omitted: "too-large" }));
    const note = screen.getByTestId("diff-omitted-src/adapters/companion/task-provenance.ts");
    expect(note.textContent).toContain("Too large");
    // Two different facts. One is about the file's nature, the other about its
    // size, and only the second might change.
    expect(note.textContent).not.toContain("Not text");
  });

  it("an EMPTY hunk list says the content did not move", () => {
    mount(file({ hunks: [] }));
    expect(
      screen.getByTestId("diff-empty-src/adapters/companion/task-provenance.ts").textContent,
    ).toContain("No lines changed");
  });

  it("CONTROL — with real hunks, none of those notes render", () => {
    // Without this, a component that showed one of the notes unconditionally
    // would pass whichever of the four tests above was checked first.
    mount(file());
    const p = "src/adapters/companion/task-provenance.ts";
    expect(screen.queryByTestId(`diff-unsupported-${p}`)).toBeNull();
    expect(screen.queryByTestId(`diff-omitted-${p}`)).toBeNull();
    expect(screen.queryByTestId(`diff-empty-${p}`)).toBeNull();
    expect(screen.getAllByTestId("diff-line-add").length).toBeGreaterThan(0);
  });
});

describe("files that cannot be opened", () => {
  it("does not link a binary file", () => {
    mount(file({ hunks: null, omitted: "binary", binary: true }));
    // A link that opened a 415 would look like a working control.
    expect(
      screen.queryByTestId("file-open-src/adapters/companion/task-provenance.ts"),
    ).toBeNull();
  });

  it("does not link a file whose diff this adapter cannot serve", () => {
    mount(file({ hunks: undefined }));
    expect(
      screen.queryByTestId("file-open-src/adapters/companion/task-provenance.ts"),
    ).toBeNull();
  });

  it("names a rename's previous path", () => {
    mount(file({ oldPath: "src/old-name.ts" }));
    expect(screen.getByText(/renamed from/).textContent).toContain("src/old-name.ts");
  });
});
