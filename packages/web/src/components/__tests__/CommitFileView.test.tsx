// TASK-1794 — a commit's file, opened in place, with its changed lines marked.
//
// The drift tests are the reason this file is long. Marking every added line is
// three lines of code; knowing whether we are still ENTITLED to mark them is the
// task. The file pane serves the working tree, while the hunk numbers describe
// the file at that commit, and for any commit that is not the newest touching a
// file those can disagree. A build that marked them anyway would look identical
// to a correct one on every fixture where nothing moved — which is most of them,
// which is exactly why the drifted fixture is here.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { CommitFileStat, DiffHunk } from "../../api";
import { addedLineNumbers, resolveChangedLines } from "../../lib/changed-lines";

// The file as it stands on disk. Lines 3 and 4 are what the commit added.
const CURRENT = [
  "const decisions = await svc.list()",
  "const adrs = []",
  "// TASK-1785 — the SOURCE read",
  "const src = await readSource(slug)",
  "return adrs",
].join("\n");

const docState = {
  markdown: CURRENT as string | null,
  isLoading: false,
  isError: false,
  isBinary: false,
};
vi.mock("../../hooks/use-workspace-docs", () => ({
  useWorkspaceDoc: () => docState,
  useWorkspaceDocs: () => ({ docs: [], isLoading: false, isError: false, missing: null }),
}));

const { CommitFileView } = await import("../CommitFileView");

const HUNK: DiffHunk = {
  oldStart: 1,
  oldLines: 3,
  newStart: 1,
  newLines: 5,
  header: "collectAdrs(",
  lines: [
    { kind: "ctx", text: "const decisions = await svc.list()", oldNo: 1, newNo: 1 },
    { kind: "ctx", text: "const adrs = []", oldNo: 2, newNo: 2 },
    { kind: "add", text: "// TASK-1785 — the SOURCE read", oldNo: null, newNo: 3 },
    { kind: "add", text: "const src = await readSource(slug)", oldNo: null, newNo: 4 },
    // A deletion. It must contribute NO marked line — see AC-1.
    { kind: "del", text: "let entry = null", oldNo: 3, newNo: null },
  ],
};

function file(over: Partial<CommitFileStat> = {}): CommitFileStat {
  return {
    path: "src/task-provenance.ts",
    insertions: 2,
    deletions: 1,
    binary: false,
    hunks: [HUNK],
    ...over,
  };
}

const BINARY = file({
  path: "assets/icon.png",
  binary: true,
  hunks: null,
  omitted: "binary",
  insertions: null,
  deletions: null,
});

const SIBLING = file({ path: "src/knowledge-service.ts" });

function mount(over: { files?: CommitFileStat[]; path?: string; onSelect?: (p: string) => void; onClose?: () => void } = {}): void {
  render(
    <CommitFileView
      files={over.files ?? [file(), SIBLING, BINARY]}
      path={over.path ?? "src/task-provenance.ts"}
      workspaceId="main"
      shortSha="17ed055"
      onSelect={over.onSelect ?? (() => {})}
      onClose={over.onClose ?? (() => {})}
    />,
  );
}

beforeEach(() => {
  docState.markdown = CURRENT;
  docState.isError = false;
  docState.isBinary = false;
});

describe("which lines a commit changed (AC-1)", () => {
  it("collects every added line, not just the first", () => {
    expect(addedLineNumbers(file())).toEqual([3, 4]);
  });

  it("a DELETED line contributes nothing", () => {
    // Its oldNo addresses a position that now holds something else. Marking it
    // would highlight unrelated code and look entirely deliberate.
    expect(addedLineNumbers(file())).not.toContain(3.5);
    expect(addedLineNumbers(file({ hunks: [{ ...HUNK, lines: [HUNK.lines[4]!] }] }))).toEqual([]);
  });

  it("has nothing to collect when there is no patch", () => {
    expect(addedLineNumbers(file({ hunks: null }))).toEqual([]);
    expect(addedLineNumbers(file({ hunks: undefined }))).toEqual([]);
  });
});

describe("marking the lines (AC-2)", () => {
  it("marks EVERY changed line, not only the first", () => {
    mount();
    const marked = screen
      .getAllByTestId(/^source-line-\d+$/)
      .filter((el) => el.getAttribute("data-marked") === "true");
    // 2 — the count the old single-line implementation could never produce.
    expect(marked).toHaveLength(2);
    expect(screen.getByTestId("source-line-3").getAttribute("data-marked")).toBe("true");
    expect(screen.getByTestId("source-line-4").getAttribute("data-marked")).toBe("true");
  });

  it("CONTROL — the untouched lines stay unmarked", () => {
    // A build that marked the whole file would satisfy the test above.
    mount();
    for (const n of [1, 2, 5]) {
      expect(screen.getByTestId(`source-line-${n}`).getAttribute("data-marked"), `line ${n}`).toBeNull();
    }
  });
});

describe("the file has moved on since the commit (AC-3)", () => {
  const DRIFTED = [
    "const decisions = await svc.list()",
    "const adrs = []",
    "// something else entirely",   // line 3 is no longer what the commit added
    "const src = await readSource(slug)",
    "return adrs",
  ].join("\n");

  it("does not mark a line whose text no longer matches", () => {
    docState.markdown = DRIFTED;
    mount();
    expect(screen.getByTestId("source-line-3").getAttribute("data-marked")).toBeNull();
    // Line 4 still matches and is still marked — drift is per line, not per file.
    expect(screen.getByTestId("source-line-4").getAttribute("data-marked")).toBe("true");
  });

  it("says so, and says how many", () => {
    docState.markdown = DRIFTED;
    mount();
    expect(screen.getByTestId("file-drifted").textContent).toContain("1 changed");
  });

  it("resolveChangedLines reports the split directly", () => {
    const r = resolveChangedLines(file(), DRIFTED);
    expect([...r.marked]).toEqual([4]);
    expect(r.drifted).toBe(1);
  });

  it("tolerates trailing whitespace rather than calling it drift", () => {
    // A formatter trimming a line moved nothing; reporting it would train the
    // reader to ignore the warning.
    const trimmed = CURRENT.replace("// TASK-1785 — the SOURCE read", "// TASK-1785 — the SOURCE read   ");
    expect(resolveChangedLines(file(), trimmed).drifted).toBe(0);
  });

  it("CONTROL (AC-4) — an un-drifted file shows NO warning", () => {
    // Without this, a build that always warned would pass every test above and
    // be wrong about every file that did not move.
    mount();
    expect(screen.queryByTestId("file-drifted")).toBeNull();
  });
});

describe("the commit's other files travel with it (AC-6)", () => {
  it("lists them, and marks the one being read", () => {
    mount();
    expect(screen.getByTestId("commit-file-chip-src/task-provenance.ts").getAttribute("aria-current")).toBe("true");
    expect(screen.getByTestId("commit-file-chip-src/knowledge-service.ts").getAttribute("aria-current")).toBeNull();
  });

  it("switching file is one click and reports the new path", () => {
    const onSelect = vi.fn();
    mount({ onSelect });
    fireEvent.click(screen.getByTestId("commit-file-chip-src/knowledge-service.ts"));
    expect(onSelect).toHaveBeenCalledWith("src/knowledge-service.ts");
  });

  it("a binary file is listed but NOT clickable (AC-7)", () => {
    // A chip that opened a 415 would look like a working control.
    mount();
    expect(screen.queryByTestId("commit-file-chip-assets/icon.png")).toBeNull();
    expect(screen.getByTestId("commit-file-unopenable-assets/icon.png")).toBeTruthy();
  });

  it("closing reports back to the caller (AC-8)", () => {
    const onClose = vi.fn();
    mount({ onClose });
    fireEvent.click(screen.getByTestId("commit-file-close"));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("what the pane claims (AC-9)", () => {
  it("states that this is the file NOW, not at the commit", () => {
    // The one thing the implementation cannot make true, so it is said rather
    // than implied.
    mount();
    const note = screen.getByTestId("commit-file-asof").textContent ?? "";
    expect(note).toContain("as it is now");
    expect(note).toContain("17ed055");
  });
});
