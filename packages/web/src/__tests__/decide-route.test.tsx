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

function serve(items: unknown[], status = 200): void {
  vi.stubGlobal("fetch", async (input: RequestInfo) => {
    const url = String(input);
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

describe("landing (TASK-2381 AC-4)", () => {
  it("opens on #/decide when something is pending", async () => {
    serve([ITEM]);
    const router = open("/");
    await waitFor(() => expect(router.state.location.pathname).toBe("/decide"));
    expect(await screen.findByRole("heading", { level: 1, name: "Cần anh quyết" })).toBeTruthy();
  });

  it("opens on #/sync when nothing is pending", async () => {
    serve([]);
    const router = open("/");
    await waitFor(() => expect(router.state.location.pathname).toBe("/sync"));
  });

  it("opens on #/sync when the pending list cannot be read", async () => {
    serve([], 500);
    const router = open("/");
    await waitFor(() => expect(router.state.location.pathname).toBe("/sync"));
  });

  it("#/decide is a real route, not swallowed by the catch-all", async () => {
    serve([]);
    const router = open("/decide");
    expect(await screen.findByRole("heading", { level: 1, name: "Cần anh quyết" })).toBeTruthy();
    expect(router.state.location.pathname).toBe("/decide");
  });
});

describe("sidebar entry (TASK-2381 AC-3)", () => {
  function nav(decide?: number) {
    render(
      <MemoryRouter>
        <SidebarNav counts={{ decide }} />
      </MemoryRouter>,
    );
  }

  it("is the first link of the sidebar and shows the pending count", () => {
    nav(3);
    const links = screen.getAllByRole("link");
    expect(links[0]?.getAttribute("href")).toBe("/decide");
    expect(screen.getByTestId("nav-decide-badge").textContent).toBe("3");
  });

  it("shows no badge at zero, and none when the count is unknown", () => {
    nav(0);
    expect(screen.queryByTestId("nav-decide-badge")).toBeNull();
  });

  it("CONTROL: no count supplied → no badge, entry still first", () => {
    nav(undefined);
    expect(screen.queryByTestId("nav-decide-badge")).toBeNull();
    expect(screen.getAllByRole("link")[0]?.getAttribute("href")).toBe("/decide");
  });
});
