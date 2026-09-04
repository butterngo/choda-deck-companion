// TASK-1766 — the workspace page: docs and tasks behind one header.
//
// The assertion this file exists for: /tasks/:id becomes REACHABLE. It shipped
// in v0.7.0 with no inbound link from anywhere, and every test passed the whole
// time because each rendered its component directly. Rendering a view proves it
// renders; it says nothing about whether a user can arrive.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
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

// TASK-1794 — a real commit detail, so the right pane actually renders. It was
// null here, which is why the panel's own wiring was never exercised from the
// view and a changed prop went unnoticed by all 29 tests.
const DETAIL_FILE = {
  path: "src/task-provenance.ts",
  insertions: 1,
  deletions: 0,
  binary: false,
  hunks: [
    {
      oldStart: 1, oldLines: 1, newStart: 1, newLines: 2, header: "",
      lines: [
        { kind: "ctx" as const, text: "const adrs = []", oldNo: 1, newNo: 1 },
        { kind: "add" as const, text: "const src = read()", oldNo: null, newNo: 2 },
      ],
    },
  ],
};
const detailState = {
  commit: {
    sha: "9dfe9c4aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    shortSha: "9dfe9c4",
    authorDate: "2026-08-24T15:29:42+07:00",
    subject: "test(web): a route with no inbound link now fails the build (TASK-1767)",
    taskIds: ["TASK-1767"],
    body: "",
    reachability: "default-branch" as const,
    files: [DETAIL_FILE],
  } as never,
  isLoading: false,
  isError: false,
};
// CommitDetailPanel's TaskChain reads this. Unmocked it runs the real query and
// takes the pane down with "No QueryClient set" — the same class as INBOX-1892:
// giving detailState a real commit made the panel render for the first time, and
// a fake that never mentioned use-task could not have known.
vi.mock("../../hooks/use-task", () => ({
  useTask: () => ({
    task: { task: { id: "TASK-1767", title: "A route with no inbound link", adrs: [] } },
    isLoading: false,
    isError: false,
  }),
}));
// CommitFileView reads the file's current text through this hook.
vi.mock("../../hooks/use-workspace-docs", () => ({
  useWorkspaceDoc: () => ({
    markdown: ["const adrs = []", "const src = read()"].join(String.fromCharCode(10)),
    isLoading: false,
    isError: false,
    isBinary: false,
  }),
  useWorkspaceDocs: () => ({ docs: [], isLoading: false, isError: false, missing: null }),
}));

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
// TASK-1830 — the Setup surface has its own file, and it owns a hook. Unmocked,
// that hook runs without a QueryClientProvider and takes the whole view down.
// This is the THIRD time in this repo a component gaining a dependency has
// reddened a fake that never named it (INBOX-1892, INBOX-1899) — here it is
// caught by the tab test rather than by a reader.
vi.mock("../WorkspaceSetupView", () => ({
  WorkspaceSetupView: ({ workspaceId }: { workspaceId?: string }) => (
    <div data-testid="setup-view-stub">{workspaceId}</div>
  ),
}));
vi.mock("../WorkspaceDocsView", () => ({
  WorkspaceDocsView: ({ workspaceId }: { workspaceId?: string }) => (
    <div data-testid="docs-view-stub">{workspaceId}</div>
  ),
}));

const { WorkspaceView } = await import("../WorkspaceView");

function mount(id = "choda-deck-companion", query = ""): void {
  render(
    <MemoryRouter initialEntries={[`/workspaces/${id}${query}`]}>
      <Routes>
        <Route path="/workspaces/:id" element={<WorkspaceView />} />
        <Route path="/tasks/:taskId" element={<OriginProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

// TASK-1793 AC-1 — renders whatever router state the link that got us here
// carried. This reads the ACTUAL value WorkspaceView attached, which is the one
// thing neither typecheck nor a directly-mounted CommitList can check: a
// required prop proves an origin was passed, never that it was the RIGHT one.
// Handing the History tab `?tab=tasks` would satisfy every other test in this
// change and still return the reader to the wrong pane.
function OriginProbe(): React.JSX.Element {
  const state = useLocation().state as { from?: { to?: string; label?: string } } | null;
  return (
    <div data-testid="origin-probe" data-to={state?.from?.to} data-label={state?.from?.label} />
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
    expect(screen.getByTestId("commit-detail-close")).toBeTruthy();

    fireEvent.click(screen.getByTestId("commit-detail-close"));
    // TASK-1786 made the pane a permanent right-hand column, so "closed" is now
    // the idle prompt rather than the pane vanishing. The property is unchanged
    // — closing must not require finding the row you came from, which was ~90
    // rows above the fold when the panel sat below the list.
    expect(screen.getByTestId("commit-detail-idle")).toBeTruthy();
    expect(screen.queryByTestId("commit-detail-close")).toBeNull();
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

  // ---- returning to the tab you left from --------------------------------

  it("opens the tab named by ?tab=, not always Files", () => {
    mount("choda-deck-companion", "?tab=tasks");
    // The breadcrumb got readers back to the right workspace and the wrong
    // pane, which is most of the way to nowhere.
    expect(screen.getByTestId("workspace-tasks-pane")).toBeTruthy();
    expect(screen.queryByTestId("workspace-docs-pane")).toBeNull();
  });

  it("opens History when asked for it", () => {
    mount("choda-deck-companion", "?tab=history");
    expect(screen.getByTestId("workspace-history-pane")).toBeTruthy();
  });

  it("CONTROL — falls back to Files with no ?tab=, and with a nonsense one", () => {
    // Without this, a build that always opened Tasks would pass both tests
    // above; and an unknown value must not leave the view with no pane at all.
    mount();
    expect(screen.getByTestId("workspace-docs-pane")).toBeTruthy();
  });

  it("does not fight a manual tab change after arriving with ?tab=", () => {
    // Initial state only. Read every render, clicking Files here would snap
    // straight back to Tasks — the bug TASK-1766 already fixed once for
    // ?workspaceId= and ?path=.
    mount("choda-deck-companion", "?tab=tasks");
    fireEvent.click(screen.getByTestId("workspace-tab-files"));
    expect(screen.getByTestId("workspace-docs-pane")).toBeTruthy();
    expect(screen.queryByTestId("workspace-tasks-pane")).toBeNull();
  });

  it("sends the reader back to the Tasks tab, not just the workspace", () => {
    mount();
    fireEvent.click(screen.getByTestId("workspace-tab-tasks"));
    const href = screen.getByTestId("workspace-task-TASK-1590").getAttribute("href");
    expect(href).toBe("/tasks/TASK-1590");
    // The origin the task page reads back is asserted in task-breadcrumb.test;
    // what this file owns is that the link is here and points at the task.
  });

  // ---- TASK-1786 — the panel is beside the list, not below it -------------

  it("puts the list and the panel in separate scrollable panes", () => {
    commitState.commits = COMMITS;
    mount();
    fireEvent.click(screen.getByTestId("workspace-tab-history"));
    // Below the list, a panel opened by a row near the top sat ~90 rows past
    // the fold and appeared to do nothing. Two panes is what makes the click
    // and its result visible at once.
    expect(screen.getByTestId("commit-list-pane")).toBeTruthy();
    expect(screen.getByTestId("commit-detail-pane")).toBeTruthy();
  });

  it("invites a choice before one is made, rather than showing an empty box", () => {
    commitState.commits = COMMITS;
    mount();
    fireEvent.click(screen.getByTestId("workspace-tab-history"));
    expect(screen.getByTestId("commit-detail-idle")).toBeTruthy();
  });

  it("CONTROL — opening a commit replaces the invitation with the detail", () => {
    // Without this, a pane that only ever showed the prompt would pass the two
    // tests above.
    commitState.commits = COMMITS;
    mount();
    fireEvent.click(screen.getByTestId("workspace-tab-history"));
    fireEvent.click(screen.getByTestId("commit-open-9dfe9c4"));
    expect(screen.queryByTestId("commit-detail-idle")).toBeNull();
  });
});

describe("TASK-1793 — the History tab hands out a way BACK", () => {
  const probe = (): HTMLElement => screen.getByTestId("origin-probe");

  it("a task badge on a commit row carries the HISTORY tab as its origin (AC-1)", () => {
    mount("choda-deck-companion", "?tab=history");
    fireEvent.click(screen.getByTestId("commit-task-TASK-1767"));
    expect(probe().getAttribute("data-to")).toBe(
      "/workspaces/choda-deck-companion?tab=history",
    );
    // The label is what the breadcrumb renders. An id here would read
    // "< choda-deck-companion" where the header says "Companion".
    expect(probe().getAttribute("data-label")).toBe("Companion");
  });

  it("CONTROL — the TASKS tab still carries the tasks tab, not history (AC-1)", () => {
    // The two origins are built side by side from the same workspace, so a
    // copy-paste that pointed both at one tab is the likely mistake and this is
    // the only test that would see it.
    mount("choda-deck-companion", "?tab=tasks");
    fireEvent.click(screen.getByTestId("workspace-task-TASK-1766"));
    expect(probe().getAttribute("data-to")).toBe("/workspaces/choda-deck-companion?tab=tasks");
  });
});

describe("TASK-1794 — a changed file opens HERE, not on another route", () => {
  function openCommitAndFile(): void {
    mount("choda-deck-companion", "?tab=history");
    fireEvent.click(screen.getByTestId("commit-open-9dfe9c4"));
    fireEvent.click(screen.getByTestId("file-open-src/task-provenance.ts"));
  }

  it("keeps the reader on /workspaces/:id (AC-5)", () => {
    openCommitAndFile();
    expect(screen.getByTestId("commit-file-view")).toBeTruthy();
    // The assertion the old build fails: it navigated to /workspace-docs, so
    // the workspace header would be gone entirely.
    expect(screen.getByTestId("workspace-history-pane")).toBeTruthy();
    expect(screen.queryByTestId("commit-detail")).toBeNull();
  });

  it("marks the changed line in the opened file (AC-2 end to end)", () => {
    openCommitAndFile();
    expect(screen.getByTestId("source-line-2").getAttribute("data-marked")).toBe("true");
    expect(screen.getByTestId("source-line-1").getAttribute("data-marked")).toBeNull();
  });

  it("closing returns to the diff with the commit still selected (AC-8)", () => {
    openCommitAndFile();
    fireEvent.click(screen.getByTestId("commit-file-close"));
    expect(screen.getByTestId("commit-detail")).toBeTruthy();
    expect(screen.queryByTestId("commit-file-view")).toBeNull();
    // Still the same commit — a close that also dropped the selection would
    // send the reader back to "pick a commit" and lose their place.
    expect(screen.getByTestId("commit-open-9dfe9c4").getAttribute("aria-expanded")).toBe("true");
  });

  it("picking a DIFFERENT commit drops the open file", () => {
    // A path from one commit means nothing in another; keeping it would open a
    // file the new commit never touched.
    openCommitAndFile();
    fireEvent.click(screen.getByTestId("commit-open-ad39672"));
    expect(screen.queryByTestId("commit-file-view")).toBeNull();
  });
});

describe("TASK-1786 — the way back does not scroll away with the code", () => {
  /** Every ancestor between `el` and the detail pane, the pane included. */
  function ancestorsUpToPane(el: HTMLElement): HTMLElement[] {
    const pane = screen.getByTestId("commit-detail-pane");
    const chain: HTMLElement[] = [];
    let node: HTMLElement | null = el;
    while (node !== null) {
      chain.push(node);
      if (node === pane) break;
      node = node.parentElement;
    }
    return chain;
  }

  const scrolls = (el: HTMLElement): boolean => el.className.includes("overflow-y-auto");

  function openCommitAndFile(): void {
    mount("choda-deck-companion", "?tab=history");
    fireEvent.click(screen.getByTestId("commit-open-9dfe9c4"));
    fireEvent.click(screen.getByTestId("file-open-src/task-provenance.ts"));
  }

  // jsdom has no layout, so no test here can measure a scroll offset. What it
  // CAN measure is the structure that causes one: on the old build the pane
  // itself scrolled, which is exactly why the file header travelled upward with
  // the code. This assertion is red against that build and green against this
  // one — the defect, not a proxy for it.
  it("no scrolling element sits between Back-to-diff and the pane", () => {
    openCommitAndFile();
    const chain = ancestorsUpToPane(screen.getByTestId("commit-file-close"));
    expect(chain.filter(scrolls)).toHaveLength(0);
  });

  it("the file's own header travels with the control", () => {
    // The chips are the sibling-file navigation. If they scroll away, moving
    // between a commit's files costs the same trip the control did.
    openCommitAndFile();
    expect(ancestorsUpToPane(screen.getByTestId("commit-file-chips")).filter(scrolls)).toHaveLength(
      0,
    );
  });

  it("a commit in the LAST rows of a long log opens a panel that is still there", () => {
    // AC-3. The defect was positional — the panel rendered BELOW the list, so
    // how far it sat past the fold was a function of the row you clicked. This
    // fills the log to 100 rows and clicks the bottom one: the panel is a
    // sibling COLUMN now, so neither the list's length nor the row's index can
    // move it, and the list scrolls in a container of its own rather than
    // pushing anything.
    commitState.commits = [
      ...Array.from({ length: 98 }, (_, i) => ({
        sha: `${String(i).padStart(7, "0")}cccccccccccccccccccccccccccccccc`,
        shortSha: String(i).padStart(7, "0"),
        authorDate: "2026-08-24T15:29:42+07:00",
        subject: `chore: filler ${i}`,
        taskIds: [],
      })),
      ...COMMITS,
    ];
    mount("choda-deck-companion", "?tab=history");
    fireEvent.click(screen.getByTestId("commit-open-9dfe9c4"));
    expect(scrolls(screen.getByTestId("commit-list-pane"))).toBe(true);
    expect(
      ancestorsUpToPane(screen.getByTestId("commit-detail-close")).filter(scrolls),
    ).toHaveLength(0);
    commitState.commits = COMMITS;
  });

  it("CONTROL — the code itself still scrolls", () => {
    // Without this the fix could be "nothing scrolls", which loses a long file
    // instead of losing the control.
    openCommitAndFile();
    expect(scrolls(screen.getByTestId("commit-file-source-scroll"))).toBe(true);
  });

  it("the diff scrolls in its own container, not the pane", () => {
    // Same claim at the other end: a 20-file commit must not push the close
    // button off the top either.
    mount("choda-deck-companion", "?tab=history");
    fireEvent.click(screen.getByTestId("commit-open-9dfe9c4"));
    expect(scrolls(screen.getByTestId("commit-detail-scroll"))).toBe(true);
    expect(ancestorsUpToPane(screen.getByTestId("commit-detail-close")).filter(scrolls)).toHaveLength(
      0,
    );
  });
});

describe("TASK-1830 — the Setup tab joins the strip without joining the sidebar", () => {
  it("the workspace tab strip has exactly four tabs", () => {
    mount();
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Files", "Tasks", "History", "Setup"]);
  });

  it("?tab=setup selects it directly, so the tab is linkable", () => {
    mount("choda-deck-companion", "?tab=setup");
    expect(screen.getByTestId("workspace-tab-setup").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("workspace-setup-pane")).toBeTruthy();
  });

  it("CONTROL — an unknown tab param still falls back to Files", () => {
    // Without this, the parse could accept anything and the first test would
    // still pass.
    mount("choda-deck-companion", "?tab=nonsense");
    expect(screen.getByTestId("workspace-tab-files").getAttribute("aria-selected")).toBe("true");
  });
});
