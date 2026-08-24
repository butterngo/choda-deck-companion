// TASK-1766 — the task-narrowing rule, tested directly rather than through a
// mocked hook. TASK-1765 established why: a view test that mocks its data hook
// makes the mock reimplement the rule, and the rule itself ends up with zero
// coverage while the suite reports green.

import { describe, it, expect } from "vitest";
import { tasksForProject } from "../use-workspace-tasks";
import type { TaskSummary } from "../../api";

const t = (id: string, projectId: string, status: string): TaskSummary => ({
  id,
  projectId,
  parentTaskId: null,
  title: id,
  status,
  priority: "medium",
  labels: [],
});

const ALL: TaskSummary[] = [
  t("TASK-1", "choda-deck", "TODO"),
  t("TASK-2", "choda-deck", "IN-PROGRESS"),
  t("TASK-3", "choda-deck", "DONE"),
  t("TASK-4", "choda-deck", "CANCELLED"),
  t("TASK-5", "english-companion", "TODO"),
];

describe("tasksForProject", () => {
  it("keeps only the named project's tasks", () => {
    expect(tasksForProject(ALL, "choda-deck").map((x) => x.id)).not.toContain("TASK-5");
  });

  it("drops DONE and CANCELLED — a workspace view is about live work", () => {
    const ids = tasksForProject(ALL, "choda-deck").map((x) => x.id);
    expect(ids).toEqual(["TASK-1", "TASK-2"]);
  });

  // Control: the filter must not be so eager that it empties everything. Without
  // this, a predicate that dropped every task would satisfy both tests above.
  it("keeps open tasks rather than dropping everything", () => {
    expect(tasksForProject(ALL, "choda-deck").length).toBe(2);
    expect(tasksForProject(ALL, "english-companion").map((x) => x.id)).toEqual(["TASK-5"]);
  });

  it("returns [] for an unknown project, not the whole list", () => {
    expect(tasksForProject(ALL, "nope")).toEqual([]);
  });
});
