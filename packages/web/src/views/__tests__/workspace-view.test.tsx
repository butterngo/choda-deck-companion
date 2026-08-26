// TASK-1766 — the workspace page: docs and tasks behind one header.
//
// The assertion this file exists for: /tasks/:id becomes REACHABLE. It shipped
// in v0.7.0 with no inbound link from anywhere, and every test passed the whole
// time because each rendered its component directly. Rendering a view proves it
// renders; it says nothing about whether a user can arrive.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import type { HealthView } from "../../hooks/use-health";
import type { TaskSummary, Workspace, WorkspaceCommit } from "../../api";

const health = (conn: HealthView["conn"]): HealthView => ({
  health: { loopAlive: true, lastPullAgeSec: 5, jwtState: "refresh", reachable: conn !== "disconnected" },
  conn,
  lastFetchedAgoSec: 2,
});

let outletValue: HealthView = health("connected");

const WORKSPACES: Workspace[] = [
  { id: "choda-deck-companion", projectId: "choda-deck", label: "Companion", cwd: "C:\\dev\\choda-deck-companion", archivedAt: null },
];

const TASKS: TaskSummary[] = [
  { id: "TASK-1590", projectId: "choda-deck", parentTaskId: null, title: "Electron adapter port", status: "IMPLEMENTED", priority: "high", labels: [] },
  { id: "TASK-1766", projectId: "choda-deck", parentTaskId: null, title: "Workspace detail", status: "IN-PROGRESS", priority: "high", labels: [] },
];

// TASK-1782 — one tagged, one not. The untagged row is the whole point: about
// 45% of real history carries no TASK-id and must still appear.
const COMMITS: WorkspaceCommit[] = [
  { sha: "9dfe9c4aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", shortSha: "9dfe9c4", authorDate: "2026-08-24T15:29:42+07:00", subject: "test(web): a route with no inbound link now fails the build (TASK-1767)", taskIds: ["TASK-1767"] },
  { sha: "ad39672bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", shortSha: "ad39672", authorDate: "2026-08-24T18:02:10+07:00", subject: "chore(release): 0.8.0 — a workspace is somewhere you can go", taskIds: [] },
];

const detailState = { commit: null, isLoading: false, isError: false };

const wsState = { workspaces: WORKSPACES, isLoading: false, isError: false };
// Data only, never a rule. INBOX-1878: a mock that reimplements a production
// filter or conditional covers up the very logic it stands in for, and the suite
// reports full green. Nothing here branches.
const commitState = {
  commits: COMMITS as WorkspaceCommit[],
  hasMore: false,
  cwd: "C:\\dev\\choda-deck-companion",
  isLoading: false,
  isError: false,
  gitUnavailable: null as { label: string; cwd: string } | null,
};
const taskState = { tasks: TASKS, scope: "project" as const, isLoading: false, isError: false };

vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useOutletContext: () => outletValue,
}));
vi.mock("../../hooks/use-workspaces", () => ({ useWorkspaces: () => wsState }));
vi.mock("../../hooks/use-workspace-tasks", () => ({ useWorkspaceTasks: () => taskState }));
vi.mock("../../hooks/use-workspace-commits", () => ({
  useWorkspaceCommits: () => commitState,
  COMMIT_PAGE_SIZE: 100,
}));
// TASK-1783 — the detail panel's hook. Data only; the panel has its own file.
// Unmocked, the real hook runs without a QueryClientProvider and takes the
// whole view down — which is how adding a dependency to a component silently
// breaks a fake that never mentioned it.
vi.mock("../../hooks/use-workspace-commit", () => ({
  useWorkspaceCommit: () => detailState,
}));
// The docs surface has its own file. Here it only has to be PRESENT — this test
// is about the page assembling, not about re-proving the doc tree.
vi.mock("../WorkspaceDocsView", () => ({
  WorkspaceDocsView: ({ workspaceId }: { workspaceId?: string }) => (
    <div data-testid="docs-view-stub">{workspaceId}</div>
  ),
}));

const { WorkspaceView } = await import("../WorkspaceView");

function mount(id = "choda-deck-companion"): void {
  render(
    <MemoryRouter initialEntries={[`/workspaces/${id}`]}>
      <Routes>
        <Route path="/workspaces/:id" element={<WorkspaceView />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("WorkspaceView (TASK-1766)", () => {
  beforeEach(() => {
    outletValue = health("connected");
    wsState.workspaces = WORKSPACES;
    wsState.isLoading = false;
    wsState.isError = false;
    taskState.tasks = TASKS;
    taskState.isLoading = false;
    taskState.isError = false;
    commitState.commits = COMMITS;
    commitState.hasMore = false;
    commitState.isLoading = false;
    commitState.isError = false;
    commitState.gitUnavailable = null;
  });

  it("reuses WorkspaceDocsView with a fixed workspaceId — not a second doc tree", () => {
    mount();
    expect(screen.getByTestId("docs-view-stub").textContent).toBe("choda-deck-companion");
  });

  it("makes /tasks/:id reachable by click — the whole point of INBOX-1875", () => {
    mount();
    fireEvent.click(screen.getByTestId("workspace-tab-tasks"));
    expect(screen.getByTestId("workspace-task-TASK-1590").getAttribute("href")).toBe("/tasks/TASK-1590");
  });

  it("states the scope instead of implying workspace precision it does not have", () => {
    mount();
    fireEvent.click(screen.getByTestId("workspace-tab-tasks"));
    // The note must name the project — a silent list would claim these are the
    // workspace's own tasks, which the adapter cannot currently support.
    expect(screen.getByTestId("task-scope-note").textContent).toContain("choda-deck");
  });

  it("shows docs first, and only swaps panes when the tab is clicked", () => {
    mount();
    expect(screen.getByTestId("workspace-docs-pane")).toBeTruthy();
    // Control: without this the tabs could be inert and every other assertion
    // above would still pass on a page that always renders both.
    expect(screen.queryByTestId("workspace-tasks-pane")).toBeNull();
    fireEvent.click(screen.getByTestId("workspace-tab-tasks"));
    expect(screen.getByTestId("workspace-tasks-pane")).toBeTruthy();
    expect(screen.queryByTestId("workspace-docs-pane")).toBeNull();
  });

  it("an unregistered workspace id is a FAILED lookup, not an empty workspace", () => {
    mount("no-such-workspace");
    expect(screen.getByTestId("error-state")).toBeTruthy();
    expect(screen.queryByTestId("empty-state")).toBeNull();
  });

  it("a project with no open tasks is an EmptyState, not an error", () => {
    taskState.tasks = [];
    mount();
    fireEvent.click(screen.getByTestId("workspace-tab-tasks"));
    expect(screen.getByTestId("empty-state")).toBeTruthy();
    expect(screen.queryByTestId("error-state")).toBeNull();
  });

  it("unreachable is its own state, distinct from both of the above", () => {
    outletValue = health("disconnected");
    mount();
    expect(screen.getByTestId("error-state")).toBeTruthy();
    expect(screen.queryByTestId("empty-state")).toBeNull();
  });

  it("offers a way back to Projects, so the hierarchy is walkable in both directions", () => {
    mount();
    expect(screen.getByText("Projects").getAttribute("href")).toBe("/projects");
  });

  // ---- TASK-1782 — History ----------------------------------------------

  it("lists every commit the adapter returned, tagged or not (AC-1, AC-2)", () => {
    mount();
    fireEvent.click(screen.getByTestId("workspace-tab-history"));
    expect(screen.getByTestId("commit-row-9dfe9c4")).toBeTruthy();
    // The untagged one is PRESENT — not filtered out.
    expect(screen.getByTestId("commit-row-ad39672")).toBeTruthy();
    expect(screen.getByTestId("commit-list").querySelectorAll("li")).toHaveLength(COMMITS.length);
  });

  it("marks the untagged commit rather than letting it pass as tagged (AC-2)", () => {
    mount();
    fireEvent.click(screen.getByTestId("workspace-tab-history"));
    expect(screen.getByTestId("commit-task-unknown")).toBeTruthy();
    // Control: the tagged one carries a real task link instead of the marker.
    expect(screen.getByTestId("commit-task-TASK-1767").getAttribute("href")).toBe("/tasks/TASK-1767");
  });

  it("a git failure is an ERROR naming the cwd, never an empty history (AC-3)", () => {
    commitState.gitUnavailable = { label: "Companion", cwd: "C:\\dev\\not-a-repo" };
    commitState.commits = [];
    mount();
    fireEvent.click(screen.getByTestId("workspace-tab-history"));
    const err = screen.getByTestId("error-state");
    expect(err.getAttribute("data-variant")).toBe("failed");
    expect(err.textContent).toContain("C:\\dev\\not-a-repo");
    // The distinction that matters: NOT an empty state, and no list.
    expect(screen.queryByTestId("empty-state")).toBeNull();
    expect(screen.queryByTestId("commit-list")).toBeNull();
  });

  it("a repo that genuinely has no commits is an EmptyState — the control for AC-3", () => {
    // Without this the 409 assertion above proves nothing: an implementation
    // that rendered an error for every empty array would pass it.
    commitState.commits = [];
    commitState.gitUnavailable = null;
    mount();
    fireEvent.click(screen.getByTestId("workspace-tab-history"));
    expect(screen.getByTestId("empty-state")).toBeTruthy();
    expect(screen.queryByTestId("error-state")).toBeNull();
  });

  it("an unreachable adapter is a DIFFERENT state from a git failure (AC-4)", () => {
    outletValue = health("disconnected");
    commitState.gitUnavailable = { label: "Companion", cwd: "C:\\dev\\not-a-repo" };
    mount();
    // The outer branch wins and says the laptop is unreachable — the variant is
    // what separates it from the 409 case, which is `failed`.
    expect(screen.getByTestId("error-state").getAttribute("data-variant")).toBe("unreachable");
  });

  it("says so when the log is longer than the page", () => {
    commitState.hasMore = true;
    mount();
    fireEvent.click(screen.getByTestId("workspace-tab-history"));
    expect(screen.getByTestId("commit-has-more")).toBeTruthy();
  });

  it("keeps History off the screen until its tab is chosen", () => {
    mount();
    expect(screen.queryByTestId("workspace-history-pane")).toBeNull();
    fireEvent.click(screen.getByTestId("workspace-tab-history"));
    expect(screen.getByTestId("workspace-history-pane")).toBeTruthy();
    expect(screen.queryByTestId("workspace-docs-pane")).toBeNull();
  });

  // ---- TASK-1788 ---------------------------------------------------------

  it("names the first tab Files, not Docs", () => {
    mount();
    // The tree now carries source as well as markdown, so "Docs" would
    // under-describe what is in it.
    expect(screen.getByTestId("workspace-tab-files").textContent).toBe("Files");
    expect(screen.queryByTestId("workspace-tab-docs")).toBeNull();
  });

  it("tells the task page where the reader came from", () => {
    mount();
    fireEvent.click(screen.getByTestId("workspace-tab-tasks"));
    // react-router serialises Link state onto the anchor's href only for the
    // path; the state itself is asserted by the breadcrumb test. What is
    // checkable here is that the link exists and points at the task.
    expect(screen.getByTestId("workspace-task-TASK-1590").getAttribute("href")).toBe(
      "/tasks/TASK-1590",
    );
  });

  it("closes the commit panel without needing the row it came from", () => {
    commitState.commits = COMMITS;
    mount();
    fireEvent.click(screen.getByTestId("workspace-tab-history"));
    fireEvent.click(screen.getByTestId("commit-open-9dfe9c4"));
    expect(screen.getByTestId("commit-detail-pane")).toBeTruthy();

    fireEvent.click(screen.getByTestId("commit-detail-close"));
    // Closing used to mean clicking the same sha again, ~90 rows above the fold
    // once the list is full (TASK-1786).
    expect(screen.queryByTestId("commit-detail-pane")).toBeNull();
  });

  it("still opens a panel after one was closed", () => {
    commitState.commits = COMMITS;
    mount();
    fireEvent.click(screen.getByTestId("workspace-tab-history"));
    fireEvent.click(screen.getByTestId("commit-open-9dfe9c4"));
    fireEvent.click(screen.getByTestId("commit-detail-close"));
    fireEvent.click(screen.getByTestId("commit-open-ad39672"));
    expect(screen.getByTestId("commit-detail-pane")).toBeTruthy();
  });
});
