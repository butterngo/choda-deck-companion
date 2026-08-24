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
import type { TaskSummary, Workspace } from "../../api";

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

const wsState = { workspaces: WORKSPACES, isLoading: false, isError: false };
const taskState = { tasks: TASKS, scope: "project" as const, isLoading: false, isError: false };

vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useOutletContext: () => outletValue,
}));
vi.mock("../../hooks/use-workspaces", () => ({ useWorkspaces: () => wsState }));
vi.mock("../../hooks/use-workspace-tasks", () => ({ useWorkspaceTasks: () => taskState }));
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
});
