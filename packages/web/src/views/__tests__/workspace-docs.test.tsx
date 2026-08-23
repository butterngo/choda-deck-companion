// TASK-1749 — the workspace docs browser.
//
// The assertion this file exists for: a workspace whose folder is gone renders
// ErrorState `failed`, NOT an EmptyState. An empty list there would be a
// statement about the repository that is not true, and the control case below
// keeps "no markdown files" from being swept into the same message.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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
const docState = { markdown: null as string | null, isLoading: false, isError: false };

vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useOutletContext: () => outletValue,
}));
vi.mock("../../hooks/use-workspace-docs", () => ({
  useWorkspaceDocs: () => listState,
  useWorkspaceDoc: () => docState,
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
  render(<WorkspaceDocsView />);
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
    render(<WorkspaceDocsView />);
    expect(screen.getByTestId("error-state")).toHaveAttribute("data-variant", "unreachable");
  });

  it("renders a skeleton, not bare text, while the list loads", () => {
    listState.isLoading = true;
    renderWithWorkspace();
    expect(screen.getByTestId("skeleton")).toBeInTheDocument();
  });

  it("no workspace chosen yet is an EmptyState, not an error", () => {
    render(<WorkspaceDocsView />);
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
    expect(screen.getByTestId("empty-state")).toHaveTextContent("No document selected");
  });

  it("groups paths into folders rather than listing them flat", () => {
    listState.docs = DOCS;
    renderWithWorkspace();

    // The adapter returns flat paths; the tree is this view's own doing, so the
    // folder names exist only if the grouping actually ran.
    expect(screen.getByText("docs")).toBeInTheDocument();
    expect(screen.getByText("knowledge")).toBeInTheDocument();
    expect(screen.getByText("INDEX.md")).toBeInTheDocument();
    expect(screen.getByText("README.md")).toBeInTheDocument();
  });
});
