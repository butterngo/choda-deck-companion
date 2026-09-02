// TASK-1749 — the workspace docs browser.
//
// The assertion this file exists for: a workspace whose folder is gone renders
// ErrorState `failed`, NOT an EmptyState. An empty list there would be a
// statement about the repository that is not true, and the control case below
// keeps "no markdown files" from being swept into the same message.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { HealthView } from "../../hooks/use-health";
import type { WorkspaceDoc } from "../../api";

const health = (conn: HealthView["conn"]): HealthView => ({
  health: { loopAlive: true, lastPullAgeSec: 5, jwtState: "refresh", reachable: conn !== "disconnected" },
  conn,
  lastFetchedAgoSec: 2,
});

let outletValue: HealthView = health("connected");

const MISSING_CWD = "C:\\dev\\choda-deck-companion";

const listState = {
  docs: [] as WorkspaceDoc[],
  cwd: null as string | null,
  label: null as string | null,
  isLoading: false,
  isError: false,
  missingFolder: null as { label: string; cwd: string } | null,
};
const docState = {
  markdown: null as string | null,
  isLoading: false,
  isError: false,
  // TASK-1788 — a binary file is listed but not served as text.
  isBinary: false,
};

vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useOutletContext: () => outletValue,
}));
vi.mock("../../hooks/use-workspace-docs", () => ({
  useWorkspaceDocs: () => listState,
  useWorkspaceDoc: () => docState,
}));
// TASK-1798 — the view gained a second hook, and an unmocked one would run for
// real here without a QueryClientProvider and take all 15 tests down with an
// error about a query client rather than about docs. That is INBOX-1892's
// pattern exactly: a fake that never named a dependency does not fail when the
// dependency appears, it fails at whatever the component does next.
vi.mock("../../hooks/use-workspace-symbols", () => ({
  useWorkspaceSymbols: (_ws: string | null, name: string | null) => ({
    name,
    matches: [],
    isLoading: false,
    isError: false,
    isResolved: false,
  }),
}));
// The picker has its own coverage. Here it only has to be clickable, because
// the view gates every other state on a workspace actually having been chosen —
// setting the hook's return value alone leaves the view on its first screen and
// quietly passes nothing.
vi.mock("../../components/WorkspaceSelect", () => ({
  WorkspaceSelect: ({ onSubmit }: { onSubmit: (id: string) => void }) => (
    <button type="button" data-testid="workspace-select" onClick={() => onSubmit("main")}>
      pick
    </button>
  ),
}));

const { WorkspaceDocsView } = await import("../WorkspaceDocsView");

const DOCS: WorkspaceDoc[] = [
  { path: "docs/knowledge/INDEX.md", size: 4200, modifiedAt: "2026-08-21T00:00:00.000Z" },
  { path: "docs/reports/discovery.md", size: 900, modifiedAt: "2026-08-21T00:00:00.000Z" },
  { path: "README.md", size: 1200, modifiedAt: "2026-08-21T00:00:00.000Z" },
];

beforeEach(() => {
  outletValue = health("connected");
  listState.docs = [];
  listState.cwd = null;
  listState.label = null;
  listState.isLoading = false;
  listState.isError = false;
  listState.missingFolder = null;
  docState.markdown = null;
  docState.isLoading = false;
  docState.isError = false;
});

/**
 * Choose a workspace through the real control rather than by reaching into the
 * view's own state — the view gates everything past its first screen on that
 * choice, so a test that skips it asserts against the wrong screen.
 */
function renderWithWorkspace(): void {
  listState.cwd = MISSING_CWD;
  listState.label = "Companion";
  render(
    <MemoryRouter>
      <WorkspaceDocsView />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByTestId("workspace-select"));
}

describe("WorkspaceDocsView — the states that look alike", () => {
  it("a missing folder is a FAILED load naming the workspace, not an empty list", () => {
    listState.missingFolder = { label: "Companion", cwd: MISSING_CWD };
    renderWithWorkspace();

    const err = screen.getByTestId("error-state");
    expect(err).toHaveAttribute("data-variant", "failed");
    expect(err).toHaveTextContent("Companion");
    expect(err).toHaveTextContent(MISSING_CWD);
    expect(screen.queryByTestId("empty-state")).not.toBeInTheDocument();
  });

  it("a folder that IS there but holds no markdown is EMPTY, not failed — the control", () => {
    // Without this the check above passes by calling every zero-doc case a
    // failure, which would be the opposite lie.
    listState.docs = [];
    renderWithWorkspace();

    expect(screen.getByTestId("empty-state")).toHaveTextContent("No documents in this workspace");
    expect(screen.queryByTestId("error-state")).not.toBeInTheDocument();
  });

  it("a silent laptop API is `unreachable` — nothing on screen can be trusted", () => {
    outletValue = health("disconnected");
    render(
    <MemoryRouter>
      <WorkspaceDocsView />
    </MemoryRouter>,
  );
    expect(screen.getByTestId("error-state")).toHaveAttribute("data-variant", "unreachable");
  });

  it("renders a skeleton, not bare text, while the list loads", () => {
    listState.isLoading = true;
    renderWithWorkspace();
    expect(screen.getByTestId("skeleton")).toBeInTheDocument();
  });

  it("no workspace chosen yet is an EmptyState, not an error", () => {
    render(
    <MemoryRouter>
      <WorkspaceDocsView />
    </MemoryRouter>,
  );
    expect(screen.getByTestId("empty-state")).toHaveTextContent("No workspace selected");
    expect(screen.queryByTestId("error-state")).not.toBeInTheDocument();
  });
});

describe("WorkspaceDocsView — the panes", () => {
  it("renders the tree and prompts for a selection before showing a reader", () => {
    listState.docs = DOCS;
    renderWithWorkspace();

    expect(screen.getByTestId("doc-tree")).toBeInTheDocument();
    expect(screen.getByTestId("workspace-doc-list-pane")).toBeInTheDocument();
    expect(screen.getByTestId("workspace-doc-detail-pane")).toBeInTheDocument();
    // TASK-1788 — asserts the STATE, not its wording. This line previously read
    // toHaveTextContent("No document selected") and broke when the copy changed
    // to "No file selected", which was a rename and not a regression. The repo's
    // own gotcha says to assert these branches by their primitive's testid
    // precisely so a copy edit cannot masquerade as a failure — and so a
    // regression to a bare <p> with the same words cannot masquerade as a pass.
    expect(screen.getByTestId("empty-state")).toBeInTheDocument();
    expect(screen.queryByTestId("error-state")).not.toBeInTheDocument();
  });

  it("groups paths into folders rather than listing them flat", () => {
    listState.docs = DOCS;
    renderWithWorkspace();

    // The adapter returns flat paths; the tree is this view's own doing, so the
    // folder names exist only if the grouping actually ran.
    //
    // TASK-1790 made folders start CLOSED, so the nested names have to be
    // unfolded to be asserted. The property under test is unchanged — that
    // `docs/knowledge/INDEX.md` became three nodes rather than one row — but
    // reading it now takes two clicks. A top-level FILE needs no unfolding,
    // which is what separates "grouped" from "hidden".
    expect(screen.getByText("docs")).toBeInTheDocument();
    expect(screen.getByText("README.md")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("doc-tree-folder-docs"));
    expect(screen.getByText("knowledge")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("doc-tree-folder-docs/knowledge"));
    expect(screen.getByText("INDEX.md")).toBeInTheDocument();
  });
});

// TASK-1766 — deep-linking. Two callers had been passing ?workspaceId= (and
// ?path=) for weeks while the view ignored both: TaskProvenance since TASK-1748
// and ProjectsView since TASK-1765. The links resolved to the right route and
// then quietly did nothing they promised — the worst kind of broken, because
// every part of it looks correct in the diff.
//
// These tests exist because injections that deleted BOTH the prop and the query
// handling left all 257 tests green. The fix had no coverage at all.
describe("WorkspaceDocsView — arriving with a workspace already chosen (TASK-1766)", () => {
  it("honours ?workspaceId= instead of asking again", () => {
    listState.docs = DOCS;
    render(
      <MemoryRouter initialEntries={["/workspace-docs?workspaceId=main"]}>
        <WorkspaceDocsView />
      </MemoryRouter>,
    );
    // The picker prompt is what a discarded query string produces.
    expect(screen.queryByText("No workspace selected")).not.toBeInTheDocument();
    expect(screen.getByTestId("workspace-doc-list-pane")).toBeInTheDocument();
  });

  it("CONTROL: with no query string it still asks — so the check above can fail", () => {
    listState.docs = DOCS;
    render(
      <MemoryRouter initialEntries={["/workspace-docs"]}>
        <WorkspaceDocsView />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("empty-state")).toHaveTextContent("No workspace selected");
  });

  it("honours ?path= so a provenance link lands ON the file, not beside it", () => {
    listState.docs = DOCS;
    docState.markdown = "# hello";
    render(
      <MemoryRouter initialEntries={["/workspace-docs?workspaceId=main&path=docs/a.md"]}>
        <WorkspaceDocsView />
      </MemoryRouter>,
    );
    // Same reasoning: the point is that the empty branch is NOT taken once a
    // path arrives from the query string.
    expect(screen.queryByTestId("empty-state")).not.toBeInTheDocument();
  });

  it("a fixed workspaceId prop wins and hides the picker — the embedded case", () => {
    listState.docs = DOCS;
    render(
      <MemoryRouter>
        <WorkspaceDocsView workspaceId="main" />
      </MemoryRouter>,
    );
    expect(screen.queryByTestId("workspace-select")).not.toBeInTheDocument();
    expect(screen.getByTestId("workspace-doc-list-pane")).toBeInTheDocument();
  });
});

// TASK-1788 — the tree now carries source as well as markdown, so the reader
// pane has to decide which of three things it is looking at.
//
// This block exists because an INJECTION found the gap: replacing the
// markdown/source branch with `true ?` — i.e. running every file through the
// markdown renderer — left all 11 tests in this file green. Nothing was
// asserting that a .ts renders verbatim.
describe("reading a file that is not markdown (TASK-1788)", () => {
  // Deliberately markdown-hostile: a leading `#` and a `*…*` pair. If the
  // source ever goes through react-markdown these become a heading and an
  // <em>, i.e. the viewer corrupts the code it claims to show.
  const SOURCE = ["# not a heading", "const x = 1;", "*not italics*"].join("\n");

  function open(path: string, over: Partial<typeof docState> = {}): void {
    listState.docs = [
      { path: "docs/a.md", size: 1, modifiedAt: "2026-08-26T00:00:00.000Z" },
      { path: "src/app.ts", size: 1, modifiedAt: "2026-08-26T00:00:00.000Z" },
      { path: "src/logo.png", size: 1, modifiedAt: "2026-08-26T00:00:00.000Z", binary: true },
    ];
    docState.markdown = SOURCE;
    docState.isBinary = false;
    docState.isError = false;
    Object.assign(docState, over);
    render(
      <MemoryRouter initialEntries={[`/workspace-docs?workspaceId=main&path=${path}`]}>
        <WorkspaceDocsView />
      </MemoryRouter>,
    );
  }

  it("shows a source file VERBATIM, not through the markdown renderer", () => {
    open("src/app.ts");
    const pre = screen.getByTestId("doc-source");
    // The leading `#` and the `*not italics*` must survive as characters. Run
    // through react-markdown they become a heading and an <em>, i.e. the viewer
    // quietly corrupts the code it claims to be showing.
    expect(pre.textContent).toContain("# not a heading");
    expect(pre.textContent).toContain("*not italics*");
    expect(screen.queryByRole("heading", { name: "not a heading" })).toBeNull();
  });

  it("CONTROL — a .md file DOES go through the markdown renderer", () => {
    // Without this, a build that rendered everything as <pre> would pass the
    // assertion above and silently kill mermaid, tables and links.
    open("docs/a.md");
    expect(screen.queryByTestId("doc-source")).toBeNull();
    expect(screen.getByRole("heading", { name: "not a heading" })).toBeTruthy();
  });

  it("a binary file is a capability note, never an error", () => {
    open("src/logo.png", { isBinary: true, markdown: null });
    expect(screen.getByTestId("doc-binary")).toBeTruthy();
    // Nothing failed — the file is there and is simply not text.
    expect(screen.queryByTestId("error-state")).toBeNull();
    expect(screen.queryByTestId("doc-source")).toBeNull();
  });

  it("CONTROL — a real load failure is still an error", () => {
    open("src/app.ts", { isBinary: false, isError: true, markdown: null });
    expect(screen.getByTestId("error-state")).toBeTruthy();
    expect(screen.queryByTestId("doc-binary")).toBeNull();
  });
});
