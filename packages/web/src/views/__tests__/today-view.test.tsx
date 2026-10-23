// TASK-2675 — the Today screen over GET /daily-report (choda-deck TASK-2673).
//
// fetch is stubbed rather than the hook, so the real react-query path runs.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { HealthView } from "../../hooks/use-health";
import type { DailyReport, FocusEntry } from "../../api";

const outletValue: HealthView = {
  health: { loopAlive: true, lastPullAgeSec: 5, jwtState: "refresh", reachable: true },
  conn: "connected",
  lastFetchedAgoSec: 2,
};

vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useOutletContext: () => outletValue,
}));

const { TodayView } = await import("../TodayView");

const zero = {
  implementedNotDone: 0,
  inProgressNoSession: 0,
  staleSessions: 0,
  overdue: 0,
  rawInbox: 0,
  dirtyWorkspaces: 0,
  unmergedBranches: 0,
  openPrs: 0,
  unscannedWorkspaces: 0,
};

const focus = (projectId: string, tier: FocusEntry["tier"], extra: Partial<FocusEntry> = {}): FocusEntry => ({
  projectId,
  tier,
  focus:
    tier === "cold"
      ? null
      : { id: `TASK-${projectId}`, title: `${projectId} focus`, status: "READY", priority: "high", dueDate: null, blockedBy: [] },
  also: [],
  awaitingClose: [],
  resume: null,
  workspace: null,
  ...extra,
});

const ws = (id: string, state: "ok" | "missing" | "not-a-repo" | "failed") => ({
  id,
  projectId: "p",
  cwd: `C:/dev/${id}`,
  state,
  reason: state === "failed" ? "boom" : null,
  prs: "ok" as const,
});

function makeReport(over: Partial<DailyReport> = {}): DailyReport {
  return {
    date: "2026-10-23",
    generatedAt: "2026-10-23T03:00:00.000Z",
    yesterday: {
      date: "2026-10-22",
      statusChanges: [{ taskId: "TASK-1", projectId: "p", title: "shipped", from: "IN-PROGRESS", to: "DONE", at: "2026-10-22T05:00:00Z" }],
      sessionsEnded: [],
      totals: { toDone: 1, toImplemented: 0, sessionsEnded: 0 },
    },
    today: { date: "2026-10-23", focus: [focus("alpha", "ready"), focus("beta", "session"), focus("gamma", "cold")] },
    outstanding: {
      totals: { ...zero, implementedNotDone: 2 },
      projects: [
        {
          projectId: "alpha",
          counts: { ...zero, implementedNotDone: 2 },
          oldestAt: "2026-06-01T00:00:00Z",
          items: [
            { kind: "implemented-not-done", id: "TASK-NEW", title: "newer", at: "2026-10-01T00:00:00Z", workspaceId: null },
            { kind: "implemented-not-done", id: "TASK-OLD", title: "older", at: "2026-06-01T00:00:00Z", workspaceId: null },
          ],
        },
      ],
    },
    coverage: { total: 30, scanned: 30, workspaces: [ws("a", "ok")] },
    ...over,
  };
}

function serve(report: DailyReport | null): void {
  vi.stubGlobal("fetch", async (input: RequestInfo) => {
    const url = String(input);
    if (report === null || !url.includes("/daily-report")) throw new TypeError("Failed to fetch");
    return new Response(JSON.stringify(report), { status: 200, headers: { "content-type": "application/json" } });
  });
}

function mount(): void {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <TodayView />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TodayView", () => {
  it("AC-1: renders Coverage, Yesterday, Focus and Outstanding in that order", async () => {
    serve(makeReport());
    mount();
    await screen.findByTestId("today-outstanding");
    const order = ["today-coverage", "today-yesterday", "today-focus", "today-outstanding"].map((id) => screen.getByTestId(id));
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("AC-2: names every unscanned workspace; with all ok it reads 'All 30 workspaces scanned'", async () => {
    serve(
      makeReport({
        coverage: {
          total: 30,
          scanned: 27,
          workspaces: [ws("gone-a", "missing"), ws("gone-b", "missing"), ws("broken", "failed"), ws("fine", "ok")],
        },
      }),
    );
    mount();
    const strip = await screen.findByTestId("today-coverage");
    for (const name of ["gone-a", "gone-b", "broken"]) expect(strip.textContent).toContain(name);
    expect(strip.textContent).not.toContain("fine");

    vi.unstubAllGlobals();
    document.body.innerHTML = "";
    serve(makeReport());
    mount();
    expect((await screen.findByTestId("today-coverage")).textContent).toContain("All 30 workspaces scanned");
  });

  it("AC-3: expanding an outstanding project shows its items oldest first", async () => {
    serve(makeReport());
    mount();
    const row = await screen.findByTestId("today-outstanding-alpha");
    fireEvent.click(within(row).getByRole("button"));
    const items = within(screen.getByTestId("today-outstanding-items-alpha")).getAllByRole("listitem");
    expect(items[0].textContent).toContain("TASK-OLD");
    expect(items[1].textContent).toContain("TASK-NEW");
  });

  it("AC-4: focus rows are ordered session then ready, and the cold project collapses into one line", async () => {
    serve(makeReport());
    mount();
    const block = await screen.findByTestId("today-focus");
    const rows = within(block).getAllByTestId(/^today-focus-(alpha|beta|gamma)$/);
    expect(rows.map((r) => r.getAttribute("data-testid"))).toEqual(["today-focus-beta", "today-focus-alpha"]);
    expect(within(rows[0]).getByText("session")).toBeTruthy();
    expect(within(rows[1]).getByText("ready")).toBeTruthy();
    expect(screen.getByTestId("today-focus-cold").textContent).toBe("1 project with no focus: gamma");
  });

  it("AC-4b: a blocked focus shows 'Blocked by TASK-9' and a resume point shows its text", async () => {
    serve(
      makeReport({
        today: {
          date: "2026-10-23",
          focus: [
            focus("alpha", "in-progress", {
              focus: { id: "TASK-5", title: "stuck", status: "IN-PROGRESS", priority: null, dueDate: null, blockedBy: ["TASK-9"] },
            }),
            focus("beta", "ready", { resume: { sessionId: "S-1", resumePoint: "pick up at the adapter route", looseEnds: [] } }),
          ],
        },
      }),
    );
    mount();
    expect(within(await screen.findByTestId("today-focus-alpha")).getByText("Blocked by TASK-9")).toBeTruthy();
    expect(within(screen.getByTestId("today-focus-beta")).getByText("pick up at the adapter route")).toBeTruthy();
  });

  it("AC-5: when the request fails, the view shows the unreachable error and not an empty state", async () => {
    serve(null);
    mount();
    const err = await screen.findByTestId("error-state");
    expect(err.getAttribute("data-variant")).toBe("unreachable");
    expect(screen.queryByTestId("empty-state")).toBeNull();
    expect(screen.queryByTestId("today-outstanding")).toBeNull();
  });
});
