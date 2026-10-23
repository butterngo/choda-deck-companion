// TASK-2381 — the decide screen is reachable and is where the app opens when
// something is pending. Mounts the REAL route table; only the Shell is replaced
// by a bare Outlet (its own polling is not what this test is about).

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { Outlet, MemoryRouter, useLocation, useRoutes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SidebarNav } from "../components/nav/SidebarNav";

vi.mock("../layouts/Shell", () => ({
  Shell: () => (
    <Outlet
      context={{
        health: { loopAlive: true, lastPullAgeSec: 1, jwtState: "refresh", reachable: true },
        conn: "connected",
        lastFetchedAgoSec: 1,
      }}
    />
  ),
}));

const { routes } = await import("../router");

// TASK-2675 — the landing page is Today, so every mount below also loads
// GET /daily-report; it gets a well-formed empty report.
const ZERO = {
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
const REPORT = {
  date: "2026-10-23",
  generatedAt: "2026-10-23T03:00:00.000Z",
  yesterday: { date: "2026-10-22", statusChanges: [], sessionsEnded: [], totals: { toDone: 0, toImplemented: 0, sessionsEnded: 0 } },
  today: { date: "2026-10-23", focus: [] },
  outstanding: { totals: ZERO, projects: [] },
  coverage: { total: 0, scanned: 0, workspaces: [] },
};

function serve(items: unknown[], status = 200): void {
  vi.stubGlobal("fetch", async (input: RequestInfo) => {
    const url = String(input);
    if (url.includes("/daily-report")) {
      return new Response(JSON.stringify(REPORT), { status: 200, headers: { "content-type": "application/json" } });
    }
    const body = url.includes("/inbox/pending") ? { items } : url.endsWith("/attention") ? { sessions: [] } : [];
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  });
}

// useRoutes in a MemoryRouter, not createMemoryRouter: a data router turns
// <Navigate> into a Request carrying jsdom's AbortSignal, which Node's fetch
// rejects, so the redirect never happens under test. Same route table either way.
let pathname = "";
function Probe(): null {
  pathname = useLocation().pathname;
  return null;
}
function App(): React.JSX.Element {
  return (
    <>
      {useRoutes(routes)}
      <Probe />
    </>
  );
}
function open(path: string): { state: { location: { pathname: string } } } {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return {
    state: {
      get location() {
        return { pathname };
      },
    },
  };
}

const ITEM = {
  id: "INBOX-1",
  source: "activity-digest",
  workspaceId: null,
  title: "x",
  content: "[activity-digest] x",
  createdAt: "2026-10-11T00:00:00Z",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

// TASK-2675 replaced TASK-2381 AC-4's landing rule (decide when something was
// pending, else sync): the app always opens on Today.
describe("landing (TASK-2675 AC-6)", () => {
  it("#/ lands on /today when something is pending", async () => {
    serve([ITEM]);
    const router = open("/");
    await waitFor(() => expect(router.state.location.pathname).toBe("/today"));
    expect(await screen.findByRole("heading", { level: 1, name: "Today" })).toBeTruthy();
  });

  it("#/ lands on /today when nothing is pending", async () => {
    serve([]);
    const router = open("/");
    await waitFor(() => expect(router.state.location.pathname).toBe("/today"));
  });

  it("#/ lands on /today even when the pending list cannot be read", async () => {
    serve([], 500);
    const router = open("/");
    await waitFor(() => expect(router.state.location.pathname).toBe("/today"));
  });

  it("#/decide is a real route, not swallowed by the catch-all", async () => {
    serve([]);
    const router = open("/decide");
    expect(await screen.findByRole("heading", { level: 1, name: "Needs your decision" })).toBeTruthy();
    expect(router.state.location.pathname).toBe("/decide");
  });
});

// TASK-2675 AC-7 put Today first; the decide entry (TASK-2381 AC-3) is now the
// second link of the top group, directly under it, and keeps its badge.
describe("sidebar entry (TASK-2381 AC-3, TASK-2675 AC-7)", () => {
  function nav(decide?: number) {
    render(
      <MemoryRouter>
        <SidebarNav counts={{ decide }} />
      </MemoryRouter>,
    );
  }

  it("Today is the first link of the top group, decide the second with its pending count", () => {
    nav(3);
    const links = screen.getAllByRole("link");
    expect(links[0]?.getAttribute("href")).toBe("/today");
    expect(links[0]?.textContent).toContain("Today");
    expect(links[1]?.getAttribute("href")).toBe("/decide");
    expect(screen.getByTestId("nav-decide-badge").textContent).toBe("3");
  });

  it("shows no badge at zero, and none when the count is unknown", () => {
    nav(0);
    expect(screen.queryByTestId("nav-decide-badge")).toBeNull();
  });

  it("CONTROL: no count supplied → no badge, Today still first and decide second", () => {
    nav(undefined);
    expect(screen.queryByTestId("nav-decide-badge")).toBeNull();
    const links = screen.getAllByRole("link");
    expect(links[0]?.getAttribute("href")).toBe("/today");
    expect(links[1]?.getAttribute("href")).toBe("/decide");
  });
});
