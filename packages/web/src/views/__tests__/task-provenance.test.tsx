// TASK-1748 — the task detail route and its provenance.
//
// The assertions that matter here are the ones separating facts that look alike
// in the data: a deleted file from a live one, and "we could not tell" from
// "nothing changed". Each is paired with a control, because a check that passes
// by flagging everything proves nothing.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { TaskDetail } from "../../api";

const taskState = {
  task: null as TaskDetail | null,
  isLoading: false,
  isError: false,
};

vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useParams: () => ({ id: "TASK-1597" }),
  Link: ({ children }: { children: React.ReactNode }) => <a href="#">{children}</a>,
}));
vi.mock("../../hooks/use-task", () => ({ useTask: () => taskState }));

const { TaskDetailView } = await import("../TaskDetailView");

function task(over: Partial<TaskDetail> = {}): TaskDetail {
  return {
    id: "TASK-1597",
    projectId: "choda-deck",
    parentTaskId: null,
    title: "Graph, search and capture use the shared state primitives",
    status: "IMPLEMENTED",
    priority: "medium",
    labels: ["companion"],
    body: "## Context\nbody",
    blockedBy: [],
    adrs: [],
    files: [],
    commits: [],
    filesConfidence: "known",
    ...over,
  } as TaskDetail;
}

const COMMIT = {
  raw: "a6ec575 feat(web): shared state primitives",
  sha: "a6ec575",
  subject: "feat(web): shared state primitives",
  workspaceId: "choda-deck-companion",
  sessionId: "SESSION-A",
};

beforeEach(() => {
  taskState.task = null;
  taskState.isLoading = false;
  taskState.isError = false;
});

describe("TaskDetailView — route and states", () => {
  it("renders a skeleton, not bare text, while the task loads", () => {
    taskState.isLoading = true;
    render(<TaskDetailView />);
    expect(screen.getByTestId("skeleton")).toBeInTheDocument();
  });

  it("a failed load is `failed`, never `unreachable` — one task failing is not the API being down", () => {
    taskState.isError = true;
    render(<TaskDetailView />);
    expect(screen.getByTestId("error-state")).toHaveAttribute("data-variant", "failed");
  });

  it("a task with no session, files or ADRs renders EmptyState, not ErrorState or a blank pane", () => {
    taskState.task = task();
    render(<TaskDetailView />);
    expect(screen.getByTestId("empty-state")).toBeInTheDocument();
    expect(screen.queryByTestId("error-state")).not.toBeInTheDocument();
  });

  it("an older adapter answering without provenance keys still renders the task", () => {
    // Forward compatibility is not the point; not crashing on the companion's
    // own vendored older adapter is.
    taskState.task = {
      ...task(),
      adrs: undefined,
      files: undefined,
      commits: undefined,
      filesConfidence: undefined,
    } as TaskDetail;
    render(<TaskDetailView />);
    expect(screen.getByText(/shared state primitives/)).toBeInTheDocument();
  });
});

describe("Files changed — the three answers", () => {
  it("commits with zero files says we could not determine, NOT that nothing changed", () => {
    taskState.task = task({ commits: [COMMIT], files: [], filesConfidence: "undeterminable" });
    render(<TaskDetailView />);

    expect(screen.getByTestId("files-undeterminable")).toBeInTheDocument();
    // The distinction the whole section exists for.
    expect(screen.queryByText("Changed no files")).not.toBeInTheDocument();
  });

  it("no commits and no files DOES say it changed no files — the control", () => {
    // Without this, the check above passes by warning on every task.
    taskState.task = task({
      commits: [],
      files: [],
      filesConfidence: "known",
      adrs: [{ slug: "ADR-033", title: "Deprecate graphify", via: "body" }],
    });
    render(<TaskDetailView />);

    expect(screen.getByText("Changed no files")).toBeInTheDocument();
    expect(screen.queryByTestId("files-undeterminable")).not.toBeInTheDocument();
  });

  it("the gap is a neutral note, never error colour", () => {
    // Painting a missing fact rose trains the eye to ignore real errors —
    // the reason CapabilityNote exists at all.
    taskState.task = task({ commits: [COMMIT], files: [], filesConfidence: "undeterminable" });
    render(<TaskDetailView />);

    expect(screen.getByTestId("capability-note")).toBeInTheDocument();
    expect(screen.queryByTestId("error-state")).not.toBeInTheDocument();
  });
});

describe("A file that no longer exists", () => {
  const files = [
    {
      path: "packages/web/src/views/SearchView.tsx",
      workspaceId: "choda-deck-companion",
      relation: "modifies" as const,
      exists: true,
    },
    {
      path: "packages/shared/src/index.ts",
      workspaceId: "choda-deck-companion",
      relation: "reference" as const,
      exists: false,
    },
  ];

  it("is distinguishable from a live one by testid, not by copy", () => {
    taskState.task = task({ files, filesConfidence: "known" });
    render(<TaskDetailView />);

    expect(screen.getByTestId("provenance-file-missing")).toBeInTheDocument();
    expect(screen.getByTestId("provenance-file")).toBeInTheDocument();
  });

  it("is NOT a link — not even one styled to look dead", () => {
    taskState.task = task({ files, filesConfidence: "known" });
    render(<TaskDetailView />);

    const dead = screen.getByTestId("provenance-file-missing");
    // A disabled-looking anchor is still an anchor to a keyboard and a screen
    // reader, so the assertion is on the absence of the element, not its style.
    expect(dead.querySelector("a")).toBeNull();
    expect(screen.getByTestId("provenance-file").querySelector("a")).not.toBeNull();
  });
});

describe("Decided by and Commits", () => {
  it("an ADR matched in prose is marked differently from one declared in frontmatter", () => {
    taskState.task = task({
      adrs: [
        { slug: "ADR-028", title: "Session end lands on implemented", via: "frontmatter" },
        { slug: "ADR-033", title: "Deprecate graphify", via: "body" },
      ],
    });
    render(<TaskDetailView />);

    expect(screen.getByTestId("adr-via-frontmatter")).toBeInTheDocument();
    expect(screen.getByTestId("adr-via-body")).toBeInTheDocument();
  });

  it("a commit names the repo its sha lives in", () => {
    // A short sha is ambiguous across the four workspaces this project spans,
    // and reading one against the wrong repo is how TASK-1747 stayed hidden.
    taskState.task = task({ commits: [COMMIT] });
    render(<TaskDetailView />);

    expect(screen.getByText("a6ec575")).toBeInTheDocument();
    expect(screen.getByText("choda-deck-companion")).toBeInTheDocument();
  });
});
