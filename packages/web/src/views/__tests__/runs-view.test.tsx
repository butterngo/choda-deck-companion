// TASK-2532 — the Runs screen over GET /runs (TASK-2531, TASK-2535).
//
// fetch is stubbed rather than the hook, so the real react-query path runs, as
// in decide-view.test.tsx.

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { HashRouter, MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { HealthView } from "../../hooks/use-health";
import type { DeployChecks, DeployItem, Run, RunAc, RunCommit, RunDeploy, RunItem, RunReport, RunReportSummary, RunsPayload, WorkspaceCommitDetail } from "../../api";
import { SidebarNav } from "../../components/nav/SidebarNav";

const outletValue: HealthView = {
  health: { loopAlive: true, lastPullAgeSec: 5, jwtState: "refresh", reachable: true },
  conn: "connected",
  lastFetchedAgoSec: 2,
};

vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useOutletContext: () => outletValue,
}));

// TASK-2598 — jsdom cannot draw mermaid; the Sequence tab only has to hand the code to MermaidBlock.
vi.mock("../../components/MermaidBlock", () => ({
  MermaidBlock: ({ code }: { code: string }) => <div data-testid="mermaid-block">{code}</div>,
}));

const { RunsView } = await import("../RunsView");

const item = (over: Partial<RunItem> & { id: string }): RunItem => ({
  title: `Title of ${over.id}`,
  status: "TODO",
  ac: { ticked: 0, total: 0, humanOpen: [] },
  commit: null,
  tests: null,
  activeSince: null,
  deps: [],
  ...over,
});

const run = (over: Partial<Run> & { goal: Run["goal"] }): Run => ({
  project: { id: "p", name: "P" },
  state: "running",
  stage: "working",
  failedAt: null,
  prUrls: [],
  items: [],
  notices: [],
  lastActivityAt: "2026-10-19T10:00:00Z",
  ...over,
});

const goal = (id: string): Run["goal"] => ({ id, title: `Goal ${id}`, status: "READY", projectId: "p" });

function serve(payload: RunsPayload | "reject"): void {
  vi.stubGlobal("fetch", async () => {
    if (payload === "reject") throw new TypeError("Failed to fetch");
    return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
  });
}

let location = { pathname: "", state: null as unknown };
function Probe(): null {
  const l = useLocation();
  location = { pathname: l.pathname, state: l.state };
  return null;
}

function mount(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/runs"]}>
        <Routes>
          <Route path="/runs" element={<RunsView />} />
          <Route path="/tasks/:id" element={<p>task page</p>} />
        </Routes>
        <Probe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** TASK-2592 — the item table now lives under the run card's Items tab. */
async function mountItems(): Promise<void> {
  mount();
  fireEvent.click(await screen.findByRole("tab", { name: "Items" }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Runs sidebar entry", () => {
  it("AC-1: SidebarNav renders a Runs link whose href ends in #/runs", () => {
    render(
      <HashRouter>
        <SidebarNav />
      </HashRouter>,
    );
    const link = screen.getAllByRole("link").find((a) => a.textContent?.includes("Runs"));
    expect(link?.getAttribute("href")?.endsWith("#/runs")).toBe(true);
  });
});

describe("RunsView", () => {
  it("AC-2: renders one heading per project in served order, each holding its own run", async () => {
    serve({
      runs: [
        run({ goal: goal("TASK-10"), project: { id: "a", name: "Alpha" } }),
        run({ goal: goal("TASK-20"), project: { id: "b", name: "Beta" } }),
      ],
      otherNotices: [],
    });
    mount();
    const headings = await screen.findAllByRole("heading", { level: 2 });
    expect(headings.map((h) => h.textContent?.replace(/\d+ runs?$/, "").trim())).toEqual(["Alpha", "Beta"]);
    expect(within(screen.getByRole("region", { name: "Alpha" })).getByText("TASK-10")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Beta" })).getByText("TASK-20")).toBeTruthy();
  });

  it("AC-3: stage pr-opened marks Started and Working done and PR opened current", async () => {
    serve({ runs: [run({ goal: goal("TASK-10"), stage: "pr-opened" })], otherNotices: [] });
    mount();
    const card = await screen.findByTestId("run-TASK-10");
    const step = (id: string): string | null => card.querySelector(`[data-step="${id}"]`)?.getAttribute("data-state") ?? null;
    expect([step("started"), step("working"), step("pr-opened")]).toEqual(["done", "done", "current"]);
  });

  it("AC-4: failedAt merged marks the Merged step failed", async () => {
    serve({ runs: [run({ goal: goal("TASK-10"), stage: "merged", failedAt: "merged" })], otherNotices: [] });
    mount();
    const card = await screen.findByTestId("run-TASK-10");
    expect(card.querySelector('[data-step="merged"]')?.getAttribute("data-state")).toBe("failed");
  });

  it("AC-5: an item row shows its commit sha, ticked/total and first passed test line", async () => {
    serve({
      runs: [
        run({
          goal: goal("TASK-10"),
          items: [
            item({
              id: "TASK-11",
              status: "IMPLEMENTED",
              commit: "7061794 feat: x",
              ac: { ticked: 2, total: 4, humanOpen: [] },
              tests: { passed: ["ServiceActorTests 4/4", "second line"], skipped: [] },
            }),
          ],
        }),
      ],
      otherNotices: [],
    });
    await mountItems();
    const row = await screen.findByTestId("run-item-TASK-11");
    expect(row.textContent).toContain("7061794");
    expect(row.textContent).toContain("2/4");
    expect(row.textContent).toContain("ServiceActorTests 4/4");
    expect(row.textContent).not.toContain("second line");
  });

  it("AC-6: an item with no commit shows a dash in its commit cell", async () => {
    serve({ runs: [run({ goal: goal("TASK-10"), items: [item({ id: "TASK-12" })] })], otherNotices: [] });
    await mountItems();
    const row = await screen.findByTestId("run-item-TASK-12");
    expect(row.querySelector('[data-col="commit"]')?.textContent).toBe("—");
  });

  it("AC-7: an item with activeSince shows working since", async () => {
    serve({
      runs: [run({ goal: goal("TASK-10"), items: [item({ id: "TASK-13", status: "IN-PROGRESS", activeSince: "2026-10-19T10:29:00Z" })] })],
      otherNotices: [],
    });
    await mountItems();
    expect((await screen.findByTestId("run-item-TASK-13")).textContent).toContain("working since");
  });

  // TASK-2532 AC-8 (a row click opens the task page) was replaced by TASK-2563:
  // the row now expands in place and the task page is the "Open task" link.

  it("AC-9: humanOpen criteria are listed under Waiting on you", async () => {
    serve({
      runs: [
        run({
          goal: goal("TASK-10"),
          items: [item({ id: "TASK-11", ac: { ticked: 1, total: 2, humanOpen: ["AC-4: check it — human"] } })],
        }),
      ],
      otherNotices: [],
    });
    await mountItems();
    const waiting = await screen.findByRole("region", { name: "Waiting on you" });
    expect(waiting.textContent).toContain("AC-4: check it — human");
  });

  it("AC-10: a run with no humanOpen criteria shows Nothing under Waiting on you", async () => {
    serve({ runs: [run({ goal: goal("TASK-10"), items: [item({ id: "TASK-11" })] })], otherNotices: [] });
    await mountItems();
    const waiting = await screen.findByRole("region", { name: "Waiting on you" });
    expect(waiting.textContent).toContain("Nothing");
  });

  it("AC-11: the Running chip hides a finished run and keeps a running one", async () => {
    serve({
      runs: [run({ goal: goal("TASK-10"), state: "running" }), run({ goal: goal("TASK-20"), state: "finished", stage: "done" })],
      otherNotices: [],
    });
    mount();
    await screen.findByTestId("run-TASK-20");
    fireEvent.click(screen.getByRole("button", { name: /^Running/ }));
    expect(screen.queryByTestId("run-TASK-20")).toBeNull();
    expect(screen.getByTestId("run-TASK-10")).toBeTruthy();
  });

  it("AC-12: an empty runs list shows an empty state naming both loops", async () => {
    serve({ runs: [], otherNotices: [] });
    mount();
    const empty = await screen.findByTestId("empty-state");
    expect(empty.textContent).toContain("/choda-autopilot");
    expect(empty.textContent).toContain("/choda-burn-backlog");
  });

  // TASK-2538 — the flow block sits in a run that has items, and only there.
  it("TASK-2538 AC-9: a run with two items renders a Flow heading", async () => {
    serve({ runs: [run({ goal: goal("TASK-10"), items: [item({ id: "TASK-11" }), item({ id: "TASK-12", deps: ["TASK-11"] })] })], otherNotices: [] });
    await mountItems();
    expect(await screen.findByRole("heading", { name: /^Flow/ })).toBeTruthy();
  });

  it("TASK-2538 AC-10: a run with no items renders no Flow heading", async () => {
    serve({ runs: [run({ goal: goal("TASK-10"), items: [] })], otherNotices: [] });
    mount();
    await screen.findByTestId("run-TASK-10");
    expect(screen.queryByRole("heading", { name: /^Flow/ })).toBeNull();
  });

  it("AC-13: a rejected GET /runs shows the error state, not the empty state", async () => {
    serve("reject");
    mount();
    expect(await screen.findByTestId("error-state")).toBeTruthy();
    expect(screen.queryByText(/\/choda-autopilot/)).toBeNull();
  });
});

// TASK-2563 — an item row expands in place to its tests, commits, files and diff.
describe("RunsView item expansion", () => {
  const SHA = "abc1234def5678abc1234def5678abc1234def56";

  function detail(over: Partial<WorkspaceCommitDetail> = {}): WorkspaceCommitDetail {
    return {
      sha: SHA,
      shortSha: "abc1234",
      authorDate: "2026-10-19T09:00:00+07:00",
      subject: "feat: item (TASK-11)",
      taskIds: ["TASK-11"],
      body: "",
      reachability: "branch-only",
      files: [
        {
          path: "src/a.ts",
          insertions: 3,
          deletions: 1,
          binary: false,
          hunks: [
            {
              oldStart: 1,
              oldLines: 1,
              newStart: 1,
              newLines: 3,
              header: "",
              lines: [
                { kind: "del", text: "old", oldNo: 1, newNo: null },
                { kind: "add", text: "[Fact]", oldNo: null, newNo: 1 },
                { kind: "add", text: "public void A_b()", oldNo: null, newNo: 2 },
                { kind: "add", text: "{ }", oldNo: null, newNo: 3 },
              ],
            },
          ],
        },
      ],
      ...over,
    };
  }

  const commitOf = (sha = SHA): RunCommit => ({ sha, subject: "feat: item (TASK-11)", workspaceId: "w", sessionId: "S-1" });

  let calls: string[] = [];
  function serveAll(items: RunItem[], commit: WorkspaceCommitDetail | 404 = detail()): void {
    calls = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("/workspaces/")) {
        if (commit === 404) return new Response(JSON.stringify({ error: "unknown commit" }), { status: 404 });
        return new Response(JSON.stringify(commit), { status: 200, headers: { "content-type": "application/json" } });
      }
      const payload: RunsPayload = { runs: [run({ goal: goal("TASK-10"), items })], otherNotices: [] };
      return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
    });
  }

  async function expand(id = "TASK-11"): Promise<HTMLElement> {
    fireEvent.click(await screen.findByTestId(`run-item-${id}`));
    return screen.findByTestId(`run-item-detail-${id}`);
  }

  it("AC-1: a fixed-shape suite line shows the suite total in the row", async () => {
    serveAll([item({ id: "TASK-11", tests: { passed: ["full suite: 760 passed, 1 skipped, 0 failed"], skipped: [] } })]);
    await mountItems();
    expect((await screen.findByTestId("run-item-TASK-11")).textContent).toContain("760 passed");
  });

  it("AC-2: a free-text first line shows +N more in the row", async () => {
    serveAll([item({ id: "TASK-11", tests: { passed: ["ServiceActorTests 4/4", "dotnet build: 0 errors"], skipped: [] } })]);
    await mountItems();
    expect((await screen.findByTestId("run-item-TASK-11")).textContent).toContain("+1 more");
  });

  it("AC-3: clicking the row sets aria-expanded to true", async () => {
    serveAll([item({ id: "TASK-11" })]);
    await mountItems();
    const row = await screen.findByTestId("run-item-TASK-11");
    fireEvent.click(row);
    expect(row.getAttribute("aria-expanded")).toBe("true");
  });

  it("AC-4: clicking the row leaves the pathname at /runs", async () => {
    serveAll([item({ id: "TASK-11" })]);
    await mountItems();
    await expand();
    expect(location.pathname).toBe("/runs");
  });

  it("AC-5: the expansion prefixes a skipped line with Skipped:", async () => {
    serveAll([item({ id: "TASK-11", tests: { passed: ["a"], skipped: ["lint: no lint step in CI"] } })]);
    await mountItems();
    expect((await expand()).textContent).toContain("Skipped: lint: no lint step in CI");
  });

  it("AC-6: the expansion shows every passed line", async () => {
    serveAll([item({ id: "TASK-11", tests: { passed: ["line one", "line two", "line three"], skipped: [] } })]);
    await mountItems();
    const tests = within(await expand()).getByRole("region", { name: "Tests" });
    for (const l of ["line one", "line two", "line three"]) expect(tests.textContent).toContain(l);
  });

  it("AC-7: the test case added by the commit is listed by name", async () => {
    serveAll([item({ id: "TASK-11", commits: [commitOf()] })]);
    await mountItems();
    const box = within(await expand()).getByRole("region", { name: "Test cases added" });
    await waitFor(() => expect(box.textContent).toContain("A b"));
  });

  it("AC-8: the Test cases added heading shows the count 1", async () => {
    serveAll([item({ id: "TASK-11", commits: [commitOf()] })]);
    await mountItems();
    const box = within(await expand()).getByRole("region", { name: "Test cases added" });
    await waitFor(() => expect(within(box).getByTestId("count").textContent).toBe("1"));
  });

  it("AC-9: the changed file shows +3", async () => {
    serveAll([item({ id: "TASK-11", commits: [commitOf()] })]);
    await mountItems();
    await expand();
    expect((await screen.findByTestId("run-file-src/a.ts")).textContent).toContain("+3");
  });

  it("AC-10: the changed file shows −1", async () => {
    serveAll([item({ id: "TASK-11", commits: [commitOf()] })]);
    await mountItems();
    await expand();
    expect((await screen.findByTestId("run-file-src/a.ts")).textContent).toContain("−1");
  });

  it("AC-11: clicking the file renders its added lines", async () => {
    serveAll([item({ id: "TASK-11", commits: [commitOf()] })]);
    await mountItems();
    await expand();
    fireEvent.click(await screen.findByTestId("run-file-src/a.ts"));
    expect(screen.getAllByTestId("diff-line-add").length).toBeGreaterThan(0);
  });

  it("AC-12: a webUrl renders a link to it", async () => {
    serveAll([item({ id: "TASK-11", commits: [commitOf()] })], detail({ webUrl: "https://github.com/o/r/commit/abc" }));
    await mountItems();
    await expand();
    const link = await screen.findByRole("link", { name: /View on GitHub/ });
    expect(link.getAttribute("href")).toBe("https://github.com/o/r/commit/abc");
  });

  it("AC-13: no webUrl renders no GitHub link", async () => {
    serveAll([item({ id: "TASK-11", commits: [commitOf()] })]);
    await mountItems();
    await expand();
    await screen.findByTestId("run-file-src/a.ts");
    const github = screen.queryAllByRole("link").filter((a) => a.getAttribute("href")?.startsWith("https://github.com"));
    expect(github).toEqual([]);
  });

  it("AC-14: an item without commits falls back to its commit", async () => {
    serveAll([item({ id: "TASK-11", commit: "7061794 feat: x" })]);
    await mountItems();
    const commits = within(await expand()).getByRole("region", { name: "Commits" });
    expect(commits.textContent).toContain("7061794");
  });

  it("AC-15: a commit that answers 404 is not readable on this machine", async () => {
    serveAll([item({ id: "TASK-11", commits: [commitOf()] })], 404);
    await mountItems();
    const box = await expand();
    await waitFor(() => expect(box.textContent).toContain("Commit not readable on this machine"));
  });

  it("AC-16: a collapsed row requests no commit", async () => {
    serveAll([item({ id: "TASK-11", commits: [commitOf()] })]);
    await mountItems();
    await screen.findByTestId("run-item-TASK-11");
    expect(calls.filter((u) => u.includes("/workspaces/"))).toEqual([]);
  });

  it("AC-17: Open task goes to /tasks/<id>", async () => {
    serveAll([item({ id: "TASK-11" })]);
    await mountItems();
    fireEvent.click(within(await expand()).getByRole("link", { name: /Open task/ }));
    await waitFor(() => expect(location.pathname).toBe("/tasks/TASK-11"));
  });

  it("AC-18: Open task carries from.to = /runs", async () => {
    serveAll([item({ id: "TASK-11" })]);
    await mountItems();
    fireEvent.click(within(await expand()).getByRole("link", { name: /Open task/ }));
    await waitFor(() => expect((location.state as { from?: { to?: string } } | null)?.from?.to).toBe("/runs"));
  });
});

// TASK-2592 — the run's feature line, feature card and tab shell.
describe("RunsView feature and tabs", () => {
  const feat = { slug: "f", title: "BPA × WorkHub", why: "W", missing: false };

  it("AC-1: a run with a feature shows its title in the card header", async () => {
    serve({ runs: [run({ goal: goal("TASK-10"), feature: feat })], otherNotices: [] });
    mount();
    const card = await screen.findByTestId("run-TASK-10");
    expect(within(card).getByTestId("run-feature-line").textContent).toContain("BPA × WorkHub");
  });

  it("AC-2: feature: null shows No feature in the card header", async () => {
    serve({ runs: [run({ goal: goal("TASK-10"), feature: null })], otherNotices: [] });
    mount();
    expect((await screen.findByTestId("run-feature-line")).textContent).toContain("No feature");
  });

  it("AC-3: a missing feature shows Feature not found: <slug>", async () => {
    serve({ runs: [run({ goal: goal("TASK-10"), feature: { slug: "gone", title: "gone", why: null, missing: true } })], otherNotices: [] });
    mount();
    expect((await screen.findByTestId("run-feature-line")).textContent).toContain("Feature not found: gone");
  });

  it("AC-4: a run without a feature field shows neither No feature nor Feature not found", async () => {
    serve({ runs: [run({ goal: goal("TASK-10") })], otherNotices: [] });
    mount();
    const card = await screen.findByTestId("run-TASK-10");
    expect(card.textContent).not.toContain("No feature");
    expect(card.textContent).not.toContain("Feature not found");
  });

  it("AC-5: an open run shows Overview and Items tabs with Overview selected", async () => {
    serve({ runs: [run({ goal: goal("TASK-10"), feature: feat })], otherNotices: [] });
    mount();
    const overview = await screen.findByRole("tab", { name: "Overview" });
    expect(screen.getByRole("tab", { name: "Items" })).toBeTruthy();
    expect(overview.getAttribute("aria-selected")).toBe("true");
  });

  it("AC-6: the Overview tab shows the feature's why text", async () => {
    serve({ runs: [run({ goal: goal("TASK-10"), feature: { ...feat, why: "WorkHub drives BPA processes." } })], otherNotices: [] });
    mount();
    const card = await screen.findByRole("region", { name: "Feature" });
    expect(card.textContent).toContain("WorkHub drives BPA processes.");
  });

  it("AC-7: Open feature links to #/knowledge?slug=f", async () => {
    serve({ runs: [run({ goal: goal("TASK-10"), feature: feat })], otherNotices: [] });
    mount();
    const link = await screen.findByRole("link", { name: /Open feature/ });
    expect(link.getAttribute("href")?.endsWith("#/knowledge?slug=f")).toBe(true);
  });

  it("AC-8: after clicking Items the item row is in the document", async () => {
    serve({ runs: [run({ goal: goal("TASK-10"), items: [item({ id: "TASK-11" })] })], otherNotices: [] });
    mount();
    await screen.findByRole("tab", { name: "Overview" });
    expect(screen.queryByTestId("run-item-TASK-11")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Items" }));
    expect(await screen.findByTestId("run-item-TASK-11")).toBeTruthy();
  });
});

// TASK-2598 — the item expansion's Sequence / Test cases / Commits & diff sub-tabs.
describe("RunsView item criteria", () => {
  const ac = (over: Partial<RunAc> & { index: number }): RunAc => ({
    text: `Criterion ${over.index} — test`,
    tag: "test",
    checked: true,
    method: "test",
    ref: null,
    evidence: null,
    state: "covered",
    ...over,
  });

  const withCriteria = (over: Partial<RunItem> = {}): RunItem =>
    item({
      id: "TASK-11",
      acs: [
        ac({ index: 0, ref: "ApprovalResultTests.A_b" }),
        ac({ index: 1, checked: false, method: null, state: "open" }),
      ],
      sequence: null,
      coverage: { covered: 1, weak: 0, open: 1, human: 0, total: 2 },
      ...over,
    });

  function serveItem(i: RunItem): void {
    serve({ runs: [run({ goal: goal("TASK-10"), items: [i] })], otherNotices: [] });
  }

  async function expand(): Promise<HTMLElement> {
    await mountItems();
    fireEvent.click(await screen.findByTestId("run-item-TASK-11"));
    return screen.findByTestId("run-item-detail-TASK-11");
  }

  function subTab(detail: HTMLElement, name: string): void {
    fireEvent.click(within(detail).getByRole("tab", { name }));
  }

  it("AC-0: an expanded item shows Sequence, Test cases and Commits & diff, with Test cases selected", async () => {
    serveItem(withCriteria());
    const detail = await expand();
    const tabs = within(within(detail).getByRole("tablist", { name: "Item views" })).getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Sequence", "Test cases", "Commits & diff"]);
    expect(within(detail).getByRole("tab", { name: "Test cases" }).getAttribute("aria-selected")).toBe("true");
  });

  it('AC-1: sequence { na: "docs only" } shows "No diagram — docs only" under Sequence', async () => {
    serveItem(withCriteria({ sequence: { na: "docs only" } }));
    const detail = await expand();
    subTab(detail, "Sequence");
    expect(within(detail).getByText("No diagram — docs only")).toBeTruthy();
  });

  it("AC-2: a mermaid sequence renders a MermaidBlock under Sequence", async () => {
    serveItem(withCriteria({ sequence: { mermaid: "sequenceDiagram\n A->>B: x" } }));
    const detail = await expand();
    expect(within(detail).queryByTestId("mermaid-block")).toBeNull();
    subTab(detail, "Sequence");
    expect(within(detail).getByTestId("mermaid-block").textContent).toContain("A->>B: x");
  });

  it('AC-3: an open criterion renders a chip reading "open"', async () => {
    serveItem(withCriteria());
    const detail = await expand();
    expect(within(within(detail).getByTestId("run-ac-1")).getByTestId("run-ac-state").textContent).toBe("open");
  });

  it("AC-4: a criterion's ref shows in its row", async () => {
    serveItem(withCriteria());
    const detail = await expand();
    expect(within(detail).getByTestId("run-ac-0").textContent).toContain("ApprovalResultTests.A_b");
  });

  it("AC-5: coverage 3/4 with one open shows 3/4 in the AC cell, in rose", async () => {
    serveItem(withCriteria({ coverage: { covered: 3, weak: 0, open: 1, human: 0, total: 4 } }));
    await mountItems();
    const cell = (await screen.findByTestId("run-item-TASK-11")).querySelector('[data-col="ac"]') as HTMLElement;
    expect(cell.textContent).toBe("3/4");
    expect(cell.className).toContain("text-rose-700");
  });

  it("an item with every criterion covered keeps the AC cell neutral", async () => {
    serveItem(withCriteria({ coverage: { covered: 4, weak: 0, open: 0, human: 0, total: 4 } }));
    await mountItems();
    const cell = (await screen.findByTestId("run-item-TASK-11")).querySelector('[data-col="ac"]') as HTMLElement;
    expect(cell.textContent).toBe("4/4");
    expect(cell.className).not.toContain("text-rose-700");
  });

  it("AC-6: an item without acs shows the expansion without the sub-tab bar", async () => {
    serveItem(item({ id: "TASK-11" }));
    const detail = await expand();
    expect(within(detail).queryByRole("tablist", { name: "Item views" })).toBeNull();
    expect(within(detail).getByRole("region", { name: "Commits" })).toBeTruthy();
  });

  it("Commits & diff holds the existing tests and commits blocks", async () => {
    serveItem(withCriteria());
    const detail = await expand();
    expect(within(detail).queryByRole("region", { name: "Commits" })).toBeNull();
    subTab(detail, "Commits & diff");
    expect(within(detail).getByRole("region", { name: "Commits" })).toBeTruthy();
    expect(within(detail).getByRole("region", { name: "Tests" })).toBeTruthy();
  });
});

// TASK-2602 — the Test report tab over run.report (TASK-2601).
describe("RunsView test report", () => {
  const SUMMARY: RunReportSummary = {
    goal: "TASK-10",
    generatedAt: "2026-10-22T00:00:00Z",
    suite: { passed: 827, skipped: 1, failed: 0 },
    testsAdded: 85,
    unreadableCommits: [],
    ac: { covered: 10, weak: 1, open: 0, human: 1, total: 12 },
    smoke: null,
    regression: [{ task: "TASK-2534", title: "An earlier run" }],
  };
  const check = (name: string, ok: boolean) => ({ name, call: `GET /${name}`, expect: "200", got: ok ? "200" : "500", ok });
  const SIX = {
    env: "qc" as const,
    base: "https://test-api.ichiba.net/bpa/x",
    build: "abc1234",
    ranAt: "2026-10-22T01:00:00Z",
    checks: [check("a", true), check("b", true), check("c", true), check("broken", false), check("d", true), check("e", true)],
    data: ["zz_test_TASK-10_1"],
  };
  const REPORT_TEXT = "---\ngoal: \"TASK-10\"\n---\n\n# Test report — TASK-10\n";
  let docCalls: string[] = [];

  function serveReport(report: RunReport | null): void {
    docCalls = [];
    const payload: RunsPayload = { runs: [run({ goal: goal("TASK-10"), report })], otherNotices: [] };
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/workspace-docs/")) {
        docCalls.push(url);
        return new Response(REPORT_TEXT, { status: 200 });
      }
      return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
    });
  }

  const withSummary = (over: Partial<RunReportSummary>): RunReport => ({
    path: "docs/reports/task-10-test-report.md",
    workspaceId: "main",
    summary: { ...SUMMARY, ...over },
  });

  async function openTab(): Promise<void> {
    mount();
    fireEvent.click(await screen.findByRole("tab", { name: "Test report" }));
  }

  it("AC-1: a run with report null shows no Test report tab", async () => {
    serveReport(null);
    mount();
    await screen.findByRole("tab", { name: "Items" });
    expect(screen.queryByRole("tab", { name: "Test report" })).toBeNull();
  });

  it("AC-2: a run with a report shows a Test report tab", async () => {
    serveReport(withSummary({}));
    mount();
    expect(await screen.findByRole("tab", { name: "Test report" })).toBeTruthy();
  });

  it("AC-3: suite 827 passed shows 827 in the first tile", async () => {
    serveReport(withSummary({}));
    await openTab();
    expect((await screen.findByTestId("report-tile-suite")).textContent).toContain("827");
  });

  it("TASK-2637: a summary with two suites shows both workspace ids and both passed counts in the first tile", async () => {
    serveReport(
      withSummary({
        suites: [
          { workspaceId: "choda-deck-companion", passed: 1243, skipped: 0, failed: 0 },
          { workspaceId: "main", passed: 2800, skipped: 56, failed: 0 },
        ],
      }),
    );
    await openTab();
    const tile = await screen.findByTestId("report-tile-suite");
    expect(screen.getAllByTestId("report-suite-row")).toHaveLength(2);
    for (const text of ["choda-deck-companion", "1243", "main", "2800"]) expect(tile.textContent).toContain(text);
    // The single total (827) gives way to the per-repo lines.
    expect(tile.textContent).not.toContain("827");
  });

  it("TASK-2637: a summary without suites renders the tile as before", async () => {
    serveReport(withSummary({}));
    await openTab();
    const tile = await screen.findByTestId("report-tile-suite");
    expect(tile.textContent).toContain("827");
    expect(screen.queryAllByTestId("report-suite-row")).toHaveLength(0);
  });

  it("AC-4: six smoke checks with one failure show 5/6 in the smoke tile", async () => {
    serveReport(withSummary({ smoke: SIX }));
    await openTab();
    expect((await screen.findByTestId("report-tile-smoke")).textContent).toContain("5/6");
  });

  it("AC-5: the failed check is the first row of the smoke table", async () => {
    serveReport(withSummary({ smoke: SIX }));
    await openTab();
    const rows = await screen.findAllByTestId("smoke-row");
    expect(rows).toHaveLength(6);
    expect(rows[0].textContent).toContain("broken");
    expect(rows[0].textContent).toContain("fail");
  });

  it("AC-6: smoke n/a shows its reason", async () => {
    serveReport(withSummary({ smoke: { na: "docs only" } }));
    await openTab();
    expect((await screen.findByTestId("report-tile-smoke")).textContent).toBe("Smoken/a — docs only");
  });

  it("AC-7: smoke null shows not run", async () => {
    serveReport(withSummary({ smoke: null }));
    await openTab();
    expect((await screen.findByTestId("report-tile-smoke")).textContent).toContain("not run");
  });

  it("AC-8: Open full report fetches the file once and shows its text in a dialog", async () => {
    serveReport(withSummary({}));
    await openTab();
    fireEvent.click(await screen.findByRole("button", { name: "Open full report" }));
    const dialog = await screen.findByTestId("run-report-dialog");
    expect((await within(dialog).findByTestId("run-report-text")).textContent).toBe(REPORT_TEXT);
    expect(docCalls).toEqual([expect.stringContaining("/workspace-docs/main/docs/reports/task-10-test-report.md")]);
    fireEvent.click(within(dialog).getByTestId("fullscreen-close"));
    fireEvent.click(screen.getByRole("button", { name: "Open full report" }));
    await screen.findByTestId("run-report-text");
    expect(docCalls).toHaveLength(1);
  });

  it("AC-9: Copy calls navigator.clipboard.writeText with the file text", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    serveReport(withSummary({}));
    await openTab();
    fireEvent.click(await screen.findByRole("button", { name: "Open full report" }));
    await screen.findByTestId("run-report-text");
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(writeText).toHaveBeenCalledWith(REPORT_TEXT);
    expect(await screen.findByRole("status")).toBeTruthy();
  });

  it("a denied clipboard selects the text and says so", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn(async () => Promise.reject(new Error("denied"))) },
      configurable: true,
    });
    serveReport(withSummary({}));
    await openTab();
    fireEvent.click(await screen.findByRole("button", { name: "Open full report" }));
    await screen.findByTestId("run-report-text");
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect((await screen.findByRole("status")).textContent).toBe("Selected — press Ctrl+C");
  });

  it("AC-10: summary null shows Report unreadable", async () => {
    serveReport({ path: "docs/reports/task-10-test-report.md", workspaceId: "main", summary: null });
    await openTab();
    expect(await screen.findByText("Report unreadable")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open full report" })).toBeTruthy();
  });
});

// TASK-2608 — the Deploy checklist and Waiting on you tabs over run.deploy
// (TASK-2607), the ticks route (TASK-2605) and POST /secrets/copy.
describe("RunsView deploy checklist", () => {
  const ITEMS: DeployItem[] = [
    { key: "sql:docs/deploy/sql/x-all.sql", phase: "before", kind: "sql", title: "Run x-all.sql", why: "Deploy SQL", workspaceId: null, file: "docs/deploy/sql/x-all.sql" },
    { key: "config:ServiceAuth:Key", phase: "before", kind: "config", title: "Set ServiceAuth:Key", why: "Read by Program.cs", workspaceId: null, copy: 'ServiceAuth__Key: "<value>"', secret: { file: "sensitive_information/keys.txt", field: "platform" } },
    { key: "manual:1", phase: "deploy", kind: "manual", title: "Turn the flag on", why: "From ## Deploy", workspaceId: null },
    { key: "endpoint:GET /x", phase: "after", kind: "endpoint", title: "Check GET /x answers", why: "New route", workspaceId: null },
  ];
  const SQL = "-- all\nCREATE TABLE approval_results (id uuid);\n";
  let posts: { url: string; body: unknown }[] = [];
  let ticks: DeployChecks = { qc: {}, prod: {} };

  function serveDeploy(deploy: RunDeploy | null, opts: { missingFile?: boolean; humanOpen?: string[] } = {}): void {
    posts = [];
    const items = [item({ id: "TASK-11", ac: { ticked: 0, total: 1, humanOpen: opts.humanOpen ?? [] } })];
    const payload: RunsPayload = { runs: [run({ goal: goal("TASK-10"), items, deploy })], otherNotices: [] };
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const json = (v: unknown) => new Response(JSON.stringify(v), { status: 200, headers: { "content-type": "application/json" } });
      if (url.includes("/deploy-checks")) {
        if (init?.method === "POST") {
          const body = JSON.parse(String(init.body)) as { env: "qc" | "prod"; itemKey: string; done: boolean };
          posts.push({ url, body });
          if (body.done) ticks[body.env][body.itemKey] = { doneBy: "butter", doneAt: "t", note: null };
          return json(ticks);
        }
        return json(ticks);
      }
      if (url.includes("/secrets/copy")) {
        posts.push({ url, body: JSON.parse(String(init?.body)) });
        return json({ value: "s3cr3t" });
      }
      if (url.includes("/workspace-docs/")) {
        return opts.missingFile ? new Response("", { status: 404 }) : new Response(SQL, { status: 200 });
      }
      return json(payload);
    });
  }

  const DEPLOY: RunDeploy = { path: "docs/reports/task-10-deploy-checklist.md", workspaceId: "main", items: ITEMS };

  async function openDeploy(): Promise<void> {
    mount();
    fireEvent.click(await screen.findByRole("tab", { name: "Deploy checklist" }));
  }

  function spyClipboard(): ReturnType<typeof vi.fn> {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    return writeText;
  }

  beforeEach(() => {
    ticks = { qc: {}, prod: {} };
  });

  it("AC-1: a run with deploy null shows neither tab", async () => {
    serveDeploy(null);
    mount();
    await screen.findByRole("tab", { name: "Items" });
    expect(screen.queryByRole("tab", { name: "Deploy checklist" })).toBeNull();
    expect(screen.queryByRole("tab", { name: /Waiting on you/ })).toBeNull();
  });

  it("AC-2: items in phases before, deploy and after show the three group headings", async () => {
    serveDeploy(DEPLOY);
    await openDeploy();
    expect(await screen.findByRole("heading", { name: "Before deploy" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Deploy" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "After deploy" })).toBeTruthy();
  });

  it("AC-3: ticking an item on QC posts { env: qc, itemKey, done: true }", async () => {
    serveDeploy(DEPLOY);
    await openDeploy();
    fireEvent.click(await screen.findByRole("checkbox", { name: "Done on QC: Run x-all.sql" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].url).toContain("/runs/TASK-10/deploy-checks");
    expect(posts[0].body).toEqual({ env: "qc", itemKey: "sql:docs/deploy/sql/x-all.sql", done: true });
  });

  it("AC-4: on Production, an item with no QC tick shows not done on QC", async () => {
    serveDeploy(DEPLOY);
    await openDeploy();
    fireEvent.click(await screen.findByRole("radio", { name: "Production" }));
    expect(within(await screen.findByTestId("deploy-item-manual:1")).getByText("not done on QC")).toBeTruthy();
  });

  it("AC-5: on Production, an item with a QC tick does not show not done on QC", async () => {
    ticks.qc["manual:1"] = { doneBy: "butter", doneAt: "t", note: null };
    serveDeploy(DEPLOY);
    await openDeploy();
    fireEvent.click(await screen.findByRole("radio", { name: "Production" }));
    const row = await screen.findByTestId("deploy-item-manual:1");
    await waitFor(() => expect(within(row).queryByText("not done on QC")).toBeNull());
    expect(within(screen.getByTestId("deploy-item-endpoint:GET /x")).getByText("not done on QC")).toBeTruthy();
  });

  it("AC-6: Open on a file item fetches the file and shows its text in a dialog", async () => {
    serveDeploy(DEPLOY);
    await openDeploy();
    const row = await screen.findByTestId("deploy-item-sql:docs/deploy/sql/x-all.sql");
    fireEvent.click(within(row).getByRole("button", { name: "Open" }));
    const dialog = await screen.findByTestId("deploy-file-dialog");
    expect((await within(dialog).findByTestId("deploy-file-text")).textContent).toBe(SQL);
  });

  it("AC-7: Copy in that dialog writes the full text to the clipboard", async () => {
    const writeText = spyClipboard();
    serveDeploy(DEPLOY);
    await openDeploy();
    fireEvent.click(within(await screen.findByTestId("deploy-item-sql:docs/deploy/sql/x-all.sql")).getByRole("button", { name: "Open" }));
    const dialog = await screen.findByTestId("deploy-file-dialog");
    await within(dialog).findByTestId("deploy-file-text");
    fireEvent.click(within(dialog).getByRole("button", { name: "Copy" }));
    expect(writeText).toHaveBeenCalledWith(SQL);
  });

  it("AC-8: a 404 on Open shows file not found at and a disabled Copy", async () => {
    serveDeploy(DEPLOY, { missingFile: true });
    await openDeploy();
    fireEvent.click(within(await screen.findByTestId("deploy-item-sql:docs/deploy/sql/x-all.sql")).getByRole("button", { name: "Open" }));
    const dialog = await screen.findByTestId("deploy-file-dialog");
    expect(await within(dialog).findByText("file not found at docs/deploy/sql/x-all.sql")).toBeTruthy();
    expect((within(dialog).getByRole("button", { name: "Copy" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("AC-9: Copy value posts /secrets/copy and writes the value to the clipboard", async () => {
    const writeText = spyClipboard();
    serveDeploy(DEPLOY);
    await openDeploy();
    fireEvent.click(within(await screen.findByTestId("deploy-item-config:ServiceAuth:Key")).getByRole("button", { name: "Copy value" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("s3cr3t"));
    expect(posts.find((p) => p.url.includes("/secrets/copy"))?.body).toEqual({ workspaceId: "main", file: "sensitive_information/keys.txt", field: "platform" });
  });

  it("AC-10: after Copy value the page text does not contain the value", async () => {
    spyClipboard();
    serveDeploy(DEPLOY);
    await openDeploy();
    fireEvent.click(within(await screen.findByTestId("deploy-item-config:ServiceAuth:Key")).getByRole("button", { name: "Copy value" }));
    expect(await screen.findByText("Copied value of ServiceAuth:Key")).toBeTruthy();
    expect(document.body.textContent).not.toContain("s3cr3t");
  });

  it("AC-11: the Waiting on you label counts unticked before/manual items plus human ACs", async () => {
    ticks.qc["sql:docs/deploy/sql/x-all.sql"] = { doneBy: "butter", doneAt: "t", note: null };
    serveDeploy(DEPLOY, { humanOpen: ["Butter checks it in the app — human"] });
    mount();
    // QC: config + manual unticked (the sql item is ticked, the endpoint is after) + 1 human AC = 3.
    expect(await screen.findByRole("tab", { name: "Waiting on you (3)" })).toBeTruthy();
  });
});

// TASK-2858 — the run card says when the run's Claude Code session waits on Butter.
describe("Run waiting badge", () => {
  const SINCE = "2026-10-28T09:05:00Z";
  const localHhmm = new Date(SINCE).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

  it("AC-1: a waiting run shows 'Waiting on you since' with the local HH:MM", async () => {
    serve({ runs: [run({ goal: goal("TASK-1"), waiting: { sessionId: "s1", since: SINCE } })], otherNotices: [] } as RunsPayload);
    mount();
    const card = await screen.findByTestId("run-TASK-1");
    expect(within(card).getByTestId("run-waiting").textContent).toBe(`Waiting on you since ${localHhmm}`);
  });

  it("AC-2: a run with waiting null shows no 'Waiting on you' text", async () => {
    serve({ runs: [run({ goal: goal("TASK-1"), waiting: null })], otherNotices: [] } as RunsPayload);
    mount();
    const card = await screen.findByTestId("run-TASK-1");
    expect(within(card).queryByText(/Waiting on you/)).toBeNull();
  });

  it("AC-3: a run from an older adapter (no waiting field) renders without the badge", async () => {
    serve({ runs: [run({ goal: goal("TASK-1") })], otherNotices: [] } as RunsPayload);
    mount();
    const card = await screen.findByTestId("run-TASK-1");
    expect(card.textContent).toContain("Goal TASK-1");
    expect(within(card).queryByTestId("run-waiting")).toBeNull();
  });
});
