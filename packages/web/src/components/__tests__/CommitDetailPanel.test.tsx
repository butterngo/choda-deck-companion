// TASK-1783 — the commit detail panel: what changed, which task, which ADRs.
//
// `useTask` is mocked with DATA only, no conditionals (INBOX-1878 — a mock
// holding a rule covers up the production logic it stands in for). Everything
// the panel decides — which absence to render, which badge, whether to mark
// reachability — is the real component's own branching.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { WorkspaceCommitDetail, TaskDetail } from "../../api";

const taskState = {
  task: null as TaskDetail | null,
  isLoading: false,
  isError: false,
};
const taskCalls: (string | null)[] = [];

vi.mock("../../hooks/use-task", () => ({
  useTask: (id: string | null) => {
    taskCalls.push(id);
    return taskState;
  },
}));

const { CommitDetailPanel } = await import("../CommitDetailPanel");

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
  adrs: [
    { slug: "ADR-031-session-end-derivation", title: "ADR-031: session_end derivation", via: "body" },
    { slug: "ADR-032-unified-knowledge-graph-v2", title: "ADR-032: graph v2", via: "frontmatter" },
  ],
};

function commit(over: Partial<WorkspaceCommitDetail> = {}): WorkspaceCommitDetail {
  return {
    sha: "9dfe9c4".padEnd(40, "0"),
    shortSha: "9dfe9c4",
    authorDate: "2026-08-24T15:29:42+07:00",
    subject: "test(web): a route with no inbound link now fails the build (TASK-1767)",
    taskIds: ["TASK-1767"],
    body: "A body line explaining why.",
    reachability: "default-branch",
    files: [
      { path: "src/a.ts", insertions: 25, deletions: 1, binary: false },
      { path: "assets/logo.png", insertions: null, deletions: null, binary: true },
    ],
    ...over,
  };
}

function mount(over: Partial<WorkspaceCommitDetail> = {}): void {
  render(
    <MemoryRouter>
      <CommitDetailPanel commit={commit(over)} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  taskState.task = TASK;
  taskState.isLoading = false;
  taskState.isError = false;
  taskCalls.length = 0;
});

describe("the change itself (AC-1)", () => {
  it("shows the subject, the body and a row per changed file with its counts", () => {
    mount();
    expect(screen.getByText(/a route with no inbound link/)).toBeTruthy();
    expect(screen.getByTestId("commit-body").textContent).toBe("A body line explaining why.");
    const row = screen.getByTestId("commit-file-src/a.ts");
    expect(row.textContent).toContain("+25");
    expect(row.textContent).toContain("1");
  });

  it("says binary rather than +0/−0 for a binary file", () => {
    mount();
    // 0/0 would assert the file did not change, which is a different claim.
    const row = screen.getByTestId("commit-file-assets/logo.png");
    expect(row.textContent).toContain("binary");
    expect(row.textContent).not.toContain("+0");
  });

  it("says 'changed no files' when git reports none — not a blank pane", () => {
    mount({ files: [] });
    expect(screen.getByText("Changed no files")).toBeTruthy();
  });
});

describe("the task and the ADRs behind it (AC-2, AC-3)", () => {
  it("resolves the id in the subject to a real title and a link", () => {
    mount();
    expect(taskCalls).toContain("TASK-1767");
    expect(screen.getByTestId("commit-task-title-TASK-1767").textContent).toBe(TASK.title);
    expect(screen.getByTestId("commit-task-link-TASK-1767").getAttribute("href")).toBe(
      "/tasks/TASK-1767",
    );
  });

  it("keeps declared and mentioned visually distinct", () => {
    mount();
    // A prose mention presented as a frontmatter declaration is a stronger
    // claim than the ADR actually made.
    expect(screen.getByTestId("commit-adr-via-body")).toBeTruthy();
    expect(screen.getByTestId("commit-adr-via-frontmatter")).toBeTruthy();
    expect(screen.getByText("mentioned")).toBeTruthy();
    expect(screen.getByText("declared")).toBeTruthy();
  });

  it("says no ADR names the task, rather than showing an empty box", () => {
    taskState.task = { ...TASK, adrs: [] };
    mount();
    expect(screen.getByTestId("commit-no-adrs-TASK-1767")).toBeTruthy();
  });

  it("distinguishes an unreadable task from a task with nothing to show", () => {
    taskState.task = null;
    taskState.isError = true;
    mount();
    // "the id is there, the record is not" — not silence, and not an error
    // state that would blame the commit.
    expect(screen.getByTestId("commit-task-unresolved-TASK-1767")).toBeTruthy();
  });
});

describe("a commit nobody tagged (AC-5)", () => {
  it("says no task is recorded, and still shows the stat", () => {
    mount({ taskIds: [] });
    expect(screen.getByTestId("commit-no-task")).toBeTruthy();
    expect(screen.getByTestId("commit-file-src/a.ts")).toBeTruthy();
    // Not an error: an untagged commit is ordinary, not broken.
    expect(screen.queryByTestId("error-state")).toBeNull();
    // And no task lookup should have been attempted for a commit with no id.
    expect(taskCalls.filter((c) => c !== null)).toEqual([]);
  });

  it("CONTROL — a tagged commit does render the task and ADR sections", () => {
    // Without this, an implementation that showed the "no task" note on every
    // commit would pass the assertion above.
    mount();
    expect(screen.queryByTestId("commit-no-task")).toBeNull();
    expect(screen.getByTestId("commit-task-title-TASK-1767")).toBeTruthy();
  });
});

describe("reachability (AC-6)", () => {
  it("marks a commit that is reachable from nothing", () => {
    mount({ reachability: "unreachable" });
    expect(screen.getByTestId("commit-unreachable")).toBeTruthy();
  });

  it("CONTROL — a default-branch commit carries no such mark", () => {
    // A mark that always renders proves nothing about the one that matters.
    mount({ reachability: "default-branch" });
    expect(screen.queryByTestId("commit-unreachable")).toBeNull();
    expect(screen.queryByTestId("commit-branch-only")).toBeNull();
  });

  it("distinguishes branch-only from both of the above", () => {
    mount({ reachability: "branch-only" });
    expect(screen.getByTestId("commit-branch-only")).toBeTruthy();
    expect(screen.queryByTestId("commit-unreachable")).toBeNull();
  });
});
