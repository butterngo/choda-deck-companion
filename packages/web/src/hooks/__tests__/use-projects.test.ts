// TASK-1765 — the grouping and counting rules, tested directly.
//
// Why this file exists: projects-view.test.tsx mocks `use-projects`, and the
// mock necessarily reimplements these two rules to stand in for them. Two
// injections proved the cost — dropping the projectId filter, and counting
// archived workspaces as live — and BOTH left all 237 tests green. The rules
// were completely uncovered while looking thoroughly tested.

import { describe, it, expect } from "vitest";
import { workspacesForProject, liveWorkspaceCount } from "../use-projects";
import type { Workspace } from "../../api";

const ws = (id: string, projectId: string, archivedAt: string | null = null): Workspace => ({
  id,
  projectId,
  label: id,
  cwd: `C:\\dev\\${id}`,
  archivedAt,
});

const ALL: Workspace[] = [
  ws("choda-deck-companion", "choda-deck"),
  ws("main", "choda-deck"),
  ws("retired", "choda-deck", "2026-01-01"),
  ws("web", "english-companion"),
];

describe("workspacesForProject", () => {
  it("returns only the named project's workspaces", () => {
    expect(workspacesForProject(ALL, "choda-deck").map((w) => w.id)).toEqual([
      "choda-deck-companion",
      "main",
      "retired",
    ]);
  });

  // The discriminating assertion: without the predicate, the call still returns
  // a populated array and every "does it render rows" test still passes.
  it("EXCLUDES other projects' workspaces", () => {
    expect(workspacesForProject(ALL, "choda-deck").map((w) => w.id)).not.toContain("web");
    expect(workspacesForProject(ALL, "english-companion").map((w) => w.id)).toEqual(["web"]);
  });

  it("returns [] for a project with none, rather than everything", () => {
    expect(workspacesForProject(ALL, "no-such-project")).toEqual([]);
  });

  it("keeps archived workspaces in the LIST — hiding them would misreport what is registered", () => {
    expect(workspacesForProject(ALL, "choda-deck").map((w) => w.id)).toContain("retired");
  });
});

describe("liveWorkspaceCount", () => {
  it("counts only non-archived workspaces", () => {
    // 3 workspaces, one archived.
    expect(liveWorkspaceCount(ALL, "choda-deck")).toBe(2);
  });

  // Control: a project with nothing archived must count all of them, so the
  // rule above cannot be satisfied by an off-by-one or a hardcoded number.
  it("counts all of them when none is archived", () => {
    expect(liveWorkspaceCount(ALL, "english-companion")).toBe(1);
  });

  it("is 0 for an unknown project", () => {
    expect(liveWorkspaceCount(ALL, "no-such-project")).toBe(0);
  });

  it("is 0 when every workspace is archived — not the total", () => {
    const allArchived = [ws("a", "p", "2026-01-01"), ws("b", "p", "2026-01-02")];
    expect(liveWorkspaceCount(allArchived, "p")).toBe(0);
  });
});
