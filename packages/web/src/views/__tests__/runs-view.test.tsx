// TASK-2532 — the Runs screen over GET /runs (TASK-2531, TASK-2535).
//
// fetch is stubbed rather than the hook, so the real react-query path runs, as
// in decide-view.test.tsx.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { HashRouter, MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { HealthView } from "../../hooks/use-health";
import type { Run, RunItem, RunsPayload } from "../../api";
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
    mount();
    const row = await screen.findByTestId("run-item-TASK-11");
    expect(row.textContent).toContain("7061794");
    expect(row.textContent).toContain("2/4");
    expect(row.textContent).toContain("ServiceActorTests 4/4");
    expect(row.textContent).not.toContain("second line");
  });

  it("AC-6: an item with no commit shows a dash in its commit cell", async () => {
    serve({ runs: [run({ goal: goal("TASK-10"), items: [item({ id: "TASK-12" })] })], otherNotices: [] });
    mount();
    const row = await screen.findByTestId("run-item-TASK-12");
    expect(row.querySelector('[data-col="commit"]')?.textContent).toBe("—");
  });

  it("AC-7: an item with activeSince shows working since", async () => {
    serve({
      runs: [run({ goal: goal("TASK-10"), items: [item({ id: "TASK-13", status: "IN-PROGRESS", activeSince: "2026-10-19T10:29:00Z" })] })],
      otherNotices: [],
    });
    mount();
    expect((await screen.findByTestId("run-item-TASK-13")).textContent).toContain("working since");
  });

  it("AC-8: clicking an item row opens /tasks/<id> with from.to = /runs", async () => {
    serve({ runs: [run({ goal: goal("TASK-10"), items: [item({ id: "TASK-11" })] })], otherNotices: [] });
    mount();
    fireEvent.click(await screen.findByTestId("run-item-TASK-11"));
    await waitFor(() => expect(location.pathname).toBe("/tasks/TASK-11"));
    expect((location.state as { from?: { to?: string } } | null)?.from?.to).toBe("/runs");
  });

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
    mount();
    const waiting = await screen.findByRole("region", { name: "Waiting on you" });
    expect(waiting.textContent).toContain("AC-4: check it — human");
  });

  it("AC-10: a run with no humanOpen criteria shows Nothing under Waiting on you", async () => {
    serve({ runs: [run({ goal: goal("TASK-10"), items: [item({ id: "TASK-11" })] })], otherNotices: [] });
    mount();
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

  it("AC-13: a rejected GET /runs shows the error state, not the empty state", async () => {
    serve("reject");
    mount();
    expect(await screen.findByTestId("error-state")).toBeTruthy();
    expect(screen.queryByText(/\/choda-autopilot/)).toBeNull();
  });
});
