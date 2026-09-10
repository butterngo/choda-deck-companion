// TASK-1766 / TASK-1773 — the narrowing rule, tested directly rather than
// through a mocked hook. TASK-1765 established why: a view test that mocks its
// data hook makes the mock reimplement the rule, and the rule itself ends up
// with zero coverage while the suite reports green.
//
// The project filter that used to live here is gone — TASK-1773 moved it into
// the adapter, where it can narrow before 4 MB crosses the wire. What is left
// on this side is the terminal-state filter and the old-adapter detection.

import { describe, it, expect } from "vitest";
import { openTasks, scopeOf } from "../use-workspace-tasks";
import type { TaskSummary } from "../../api";

const t = (id: string, status: string, scope?: TaskSummary["scope"]): TaskSummary => ({
  id,
  projectId: "choda-deck",
  parentTaskId: null,
  title: id,
  status,
  priority: "medium",
  labels: [],
  ...(scope === undefined ? {} : { scope }),
});

describe("openTasks", () => {
  const ALL = [
    t("TASK-1", "TODO"),
    t("TASK-2", "IN-PROGRESS"),
    t("TASK-3", "DONE"),
    t("TASK-4", "CANCELLED"),
  ];

  it("drops DONE and CANCELLED — a workspace view is about live work", () => {
    expect(openTasks(ALL).map((x) => x.id)).toEqual(["TASK-1", "TASK-2"]);
  });

  // Control: a predicate that dropped everything would satisfy the test above.
  it("CONTROL — keeps the open ones rather than emptying the list", () => {
    expect(openTasks(ALL)).toHaveLength(2);
  });
});

describe("scopeOf — did the adapter actually scope, or just answer?", () => {
  it("reads a fully tagged list as workspace-scoped", () => {
    expect(scopeOf([t("TASK-1", "TODO", "touches"), t("TASK-2", "TODO", "unscoped")])).toBe(
      "workspace",
    );
  });

  it("reads untagged rows as an OLD adapter, not as a workspace answer", () => {
    // The pre-TASK-1773 adapter ignores ?workspaceId= and returns 200 with the
    // whole project. Believing that response is how a false "narrowed to this
    // workspace" claim would reach the screen.
    expect(scopeOf([t("TASK-1", "TODO"), t("TASK-2", "TODO")])).toBe("project");
  });

  it("treats a PARTIALLY tagged list as unscoped rather than trusting it", () => {
    // One untagged row among tagged ones is a server bug, not an old adapter.
    // Reading `some` instead of `every` would swallow it silently.
    expect(scopeOf([t("TASK-1", "TODO", "touches"), t("TASK-2", "TODO")])).toBe("project");
  });

  it("calls an empty list workspace-scoped — there is nothing to contradict it", () => {
    expect(scopeOf([])).toBe("workspace");
  });
});
