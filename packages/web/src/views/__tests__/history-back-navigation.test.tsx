// TASK-1793 — a task opened from History can get back to History.
//
// TASK-1788 built the contextual breadcrumb and wired ONE of the three links
// that lead to a task. The other two were both in the History tab, so the audit
// chain this epic exists for — commit → task → why — ended on a page whose only
// way out was "Projects", two levels above the workspace the reader was in.
//
// These tests do the JOURNEY rather than inspect a prop. `state` on a <Link> has
// no DOM representation, so asserting the components "pass origin" would mean
// asserting the source code, which cannot distinguish a value that is passed
// from one that arrives. Clicking through to the real TaskDetailView and reading
// the real breadcrumb's href is the only assertion that fails when the wiring is
// wrong.
//
// The no-origin CONTROL (AC-4) lives in task-breadcrumb.test.tsx, which already
// proves a cold deep link still falls back to /projects. It is not duplicated
// here; what IS duplicated here is the control that the fallback is not being
// silently produced in these cases too — see "the control" in each block.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import type { TaskDetail, WorkspaceCommit, WorkspaceCommitDetail } from "../../api";
import { historyOrigin } from "../../lib/origin";

const TASK: TaskDetail = {
  id: "TASK-1550",
  projectId: "choda-deck",
  parentTaskId: null,
  title: "Clean up leaves ~38% of a real transcript uncleaned",
  status: "IN-PROGRESS",
  priority: "high",
  labels: [],
  body: null,
  blockedBy: [],
};

// Both TaskDetailView and CommitDetailPanel's TaskChain read this same hook.
vi.mock("../../hooks/use-task", () => ({
  useTask: () => ({ task: TASK, isLoading: false, isError: false }),
}));
vi.mock("../../components/TaskDetailPanel", () => ({
  TaskDetailPanel: () => <div data-testid="panel-stub" />,
}));
vi.mock("../../components/TaskProvenance", () => ({ TaskProvenance: () => null }));

const { TaskDetailView } = await import("../TaskDetailView");
const { CommitList } = await import("../../components/CommitList");
const { CommitDetailPanel } = await import("../../components/CommitDetailPanel");

const COMMIT: WorkspaceCommit = {
  sha: "17ed0559f4b1c2d3e4f5061728394a5b6c7d8e9f",
  shortSha: "17ed055",
  authorDate: "2026-08-25T17:04:11+07:00",
  subject: "feat(adapter): read a knowledge source without its staleness (TASK-1550)",
  taskIds: ["TASK-1550"],
};

const DETAIL: WorkspaceCommitDetail = {
  ...COMMIT,
  body: "The staleness field is omitted, not emptied.",
  reachability: "default-branch",
  files: [],
};

const ORIGIN = historyOrigin("choda-deck-companion", "Companion");

/** Mount `screen` at /history, with a real /tasks/:id route to arrive at. */
function mount(screenUnderTest: React.JSX.Element): void {
  render(
    <MemoryRouter initialEntries={["/history"]}>
      <Routes>
        <Route path="/history" element={screenUnderTest} />
        <Route path="/tasks/:id" element={<TaskDetailView />} />
      </Routes>
    </MemoryRouter>,
  );
}

const crumb = (): HTMLElement => screen.getByTestId("task-breadcrumb");

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("the task badge on a commit ROW (AC-2)", () => {
  it("leads to a task whose breadcrumb returns to History", () => {
    mount(<CommitList commits={[COMMIT]} origin={ORIGIN} />);
    fireEvent.click(screen.getByTestId("commit-task-TASK-1550"));

    // We really navigated — the task page is rendered, not the list.
    expect(screen.getByTestId("panel-stub")).toBeTruthy();
    const href = crumb().getAttribute("href") ?? "";
    expect(href).toContain("tab=history");
    expect(href).toContain("choda-deck-companion");
  });

  it("CONTROL — that breadcrumb is NOT the /projects fallback", () => {
    // This is the assertion the bug would fail. Before TASK-1793 the click
    // worked, the task rendered, and the breadcrumb read "Projects" — every
    // other assertion in this file would have passed.
    mount(<CommitList commits={[COMMIT]} origin={ORIGIN} />);
    fireEvent.click(screen.getByTestId("commit-task-TASK-1550"));
    expect(crumb().getAttribute("href")).not.toBe("/projects");
    expect(crumb().textContent).toContain("Companion");
  });
});

describe("the Task link inside the commit DETAIL panel (AC-3)", () => {
  // A separate component and a separate <Link>. One test cannot cover both, and
  // the pre-TASK-1793 build had the same omission in each — which is exactly how
  // one fix could have been made while the other stayed broken.
  it("leads to a task whose breadcrumb returns to History", () => {
    mount(<CommitDetailPanel commit={DETAIL} workspaceId="choda-deck-companion" origin={ORIGIN} />);
    fireEvent.click(screen.getByTestId("commit-task-link-TASK-1550"));

    expect(screen.getByTestId("panel-stub")).toBeTruthy();
    expect(crumb().getAttribute("href")).toContain("tab=history");
  });

  it("CONTROL — that breadcrumb is NOT the /projects fallback", () => {
    mount(<CommitDetailPanel commit={DETAIL} workspaceId="choda-deck-companion" origin={ORIGIN} />);
    fireEvent.click(screen.getByTestId("commit-task-link-TASK-1550"));
    expect(crumb().getAttribute("href")).not.toBe("/projects");
    expect(crumb().textContent).toContain("Companion");
  });
});

describe("the origin builders", () => {
  it("point at the tab, not merely at the workspace", () => {
    // A destination of `/workspaces/x` alone would return the reader to the
    // workspace on its DEFAULT tab (Files) — the exact half-right outcome
    // TASK-1788 shipped and then had to fix for the Tasks tab.
    expect(historyOrigin("main", "Main").to).toBe("/workspaces/main?tab=history");
  });

  it("encodes an id that would otherwise break the URL", () => {
    expect(historyOrigin("a/b", "X").to).toContain("a%2Fb");
  });
});
