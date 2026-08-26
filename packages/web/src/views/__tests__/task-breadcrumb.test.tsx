// TASK-1788 — the way back out of a task detail page.
//
// The defect: the breadcrumb was a hard link to /projects. Arriving from a
// workspace's Tasks tab, "back" threw the reader two levels up and forgot which
// workspace they were in. A packaged Electron window has no address bar and no
// browser back button (INBOX-1875), so this link is the whole navigation model.
//
// The NO-ORIGIN test is the one that matters. An implementation that only reads
// the carried origin passes every assertion about the carried case and leaves
// deep links, Search and the graph drawer with a dead control. It is written
// first here for that reason.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import type { TaskDetail } from "../../api";

const taskState = {
  task: null as TaskDetail | null,
  isLoading: false,
  isError: false,
};

vi.mock("../../hooks/use-task", () => ({ useTask: () => taskState }));
vi.mock("../../components/TaskDetailPanel", () => ({
  TaskDetailPanel: () => <div data-testid="panel-stub" />,
}));
vi.mock("../../components/TaskProvenance", () => ({ TaskProvenance: () => null }));

const { TaskDetailView } = await import("../TaskDetailView");

const TASK: TaskDetail = {
  id: "TASK-1767",
  projectId: "choda-deck",
  parentTaskId: null,
  title: "A route with no inbound link now fails the build",
  status: "DONE",
  priority: "high",
  labels: [],
  body: null,
  blockedBy: [],
};

/** `state` is what a caller attaches to its <Link>; null means arrived cold. */
function mount(state: unknown): void {
  render(
    <MemoryRouter initialEntries={[{ pathname: "/tasks/TASK-1767", state }]}>
      <Routes>
        <Route path="/tasks/:id" element={<TaskDetailView />} />
      </Routes>
    </MemoryRouter>,
  );
}

const crumb = (): HTMLElement => screen.getByTestId("task-breadcrumb");

beforeEach(() => {
  taskState.task = TASK;
  taskState.isLoading = false;
  taskState.isError = false;
});

describe("arriving with no origin (AC-4)", () => {
  it("still offers a working destination on a cold deep link", () => {
    mount(null);
    expect(crumb().getAttribute("href")).toBe("/projects");
    expect(crumb().textContent?.trim().length).toBeGreaterThan(0);
  });

  it("falls back rather than rendering an empty href when state is malformed", () => {
    // Search and the graph drawer link here without state today. A `from` that
    // exists but carries no `to` is the shape a half-finished caller produces.
    mount({ from: {} });
    expect(crumb().getAttribute("href")).toBe("/projects");
  });

  it("falls back when `to` is present but empty", () => {
    // `/workspaces/${workspace?.id ?? ""}` yields exactly this when the
    // workspace has not resolved yet — a link to nowhere that still looks set.
    mount({ from: { to: "", label: "Companion" } });
    expect(crumb().getAttribute("href")).toBe("/projects");
  });
});

describe("arriving from a workspace (AC-3)", () => {
  it("names the workspace and links back to it", () => {
    mount({ from: { to: "/workspaces/remote-workflow", label: "remote-workflow" } });
    expect(crumb().getAttribute("href")).toBe("/workspaces/remote-workflow");
    expect(crumb().textContent).toContain("remote-workflow");
  });

  it("does NOT say Projects when an origin was carried — the control", () => {
    // Without this, an implementation that ignored the state entirely would
    // pass every AC-4 test above and none of the point of the change.
    mount({ from: { to: "/workspaces/main", label: "Main" } });
    expect(crumb().getAttribute("href")).not.toBe("/projects");
    expect(crumb().textContent).not.toContain("Projects");
  });

  it("uses a generic label when the origin gives a destination but no name", () => {
    mount({ from: { to: "/workspaces/main" } });
    expect(crumb().getAttribute("href")).toBe("/workspaces/main");
    expect(crumb().textContent?.trim().length).toBeGreaterThan(0);
  });
});
