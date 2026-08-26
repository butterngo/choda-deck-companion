// TASK-1782 — the commit row itself.
//
// CommitList takes its data as props, so nothing is mocked here and no stub
// stands in for the rule being tested (INBOX-1878: a mock containing a
// conditional covers up the production logic it replaces, and the suite still
// reports green).

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { historyOrigin } from "../../lib/origin";
import { CommitList, commitDate } from "../CommitList";
import type { WorkspaceCommit } from "../../api";

// `sha` derives from `shortSha` so two fixtures in one list cannot collide —
// React keys on sha, and duplicate keys warn while still rendering, which is a
// noisy way to make a list test look fine.
function commit(over: Partial<WorkspaceCommit>): WorkspaceCommit {
  const shortSha = over.shortSha ?? "0000000";
  return {
    sha: shortSha.padEnd(40, "0"),
    shortSha,
    authorDate: "2026-08-25T17:04:11+07:00",
    subject: "chore: something",
    taskIds: [],
    ...over,
  };
}

function mount(commits: WorkspaceCommit[]): void {
  render(
    <MemoryRouter>
      <CommitList commits={commits} origin={historyOrigin("main", "Main")} />
    </MemoryRouter>,
  );
}

describe("commitDate", () => {
  it("takes the ISO date prefix, so the runner's locale cannot change it", () => {
    // toLocaleDateString would render differently on a machine set to en-US vs
    // de-DE, and a test asserting it would fail for a reason unrelated to code.
    expect(commitDate("2026-08-25T17:04:11+07:00")).toBe("2026-08-25");
    expect(commitDate("2026-01-02T23:59:59-08:00")).toBe("2026-01-02");
  });
});

describe("CommitList", () => {
  it("links every task id a commit names, not only the first", () => {
    mount([commit({ shortSha: "abc1234", taskIds: ["TASK-1750", "TASK-1748"] })]);
    expect(screen.getByTestId("commit-task-TASK-1750").getAttribute("href")).toBe("/tasks/TASK-1750");
    expect(screen.getByTestId("commit-task-TASK-1748").getAttribute("href")).toBe("/tasks/TASK-1748");
    expect(screen.queryByTestId("commit-task-unknown")).toBeNull();
  });

  it("marks an untagged commit instead of leaving the cell blank", () => {
    mount([commit({ shortSha: "def5678", taskIds: [] })]);
    // A blank cell and a tagged commit whose badge failed to render look the
    // same; the explicit marker is what makes the absence readable.
    expect(screen.getByTestId("commit-task-unknown")).toBeTruthy();
  });

  it("renders a row per commit and keeps the subject available in full", () => {
    const long = "feat(web): " + "a".repeat(200) + " (TASK-1)";
    mount([commit({ shortSha: "aaa1111", subject: long, taskIds: ["TASK-1"] }), commit({ shortSha: "bbb2222" })]);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    // Truncation is visual; the whole subject stays reachable via the title.
    expect(screen.getByTitle(long)).toBeTruthy();
  });
});
