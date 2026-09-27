// TASK-2153 AC-1 — /activity is a real route, not swallowed by the catch-all
// redirect to /sync. Mounts the REAL route table (router.tsx `routes`) in a
// memory router; only the Shell is replaced by a bare Outlet, because the Shell's
// own health polling and counts are not what this test is about.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider, Outlet } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "fs";
import { join } from "path";

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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("activity route (TASK-2153)", () => {
  it("AC-1: rendering /activity through the real route table shows the Activity view", async () => {
    vi.stubGlobal("fetch", async () => new Response("[]", { status: 200, headers: { "content-type": "application/json" } }));
    const router = createMemoryRouter(routes, { initialEntries: ["/activity"] });
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    expect(await screen.findByRole("heading", { level: 1, name: "Activity" })).toBeTruthy();
    expect(router.state.location.pathname).toBe("/activity");
  });

  it("is reached from the Sync view, and the sidebar stays unchanged (TASK-1830: no more menu)", () => {
    const sync = readFileSync(join(__dirname, "..", "views", "SyncView.tsx"), "utf8");
    expect(sync).toContain('to="/activity"');
    const nav = readFileSync(join(__dirname, "..", "components", "nav", "SidebarNav.tsx"), "utf8");
    expect(nav).not.toContain("/activity");
  });
});
