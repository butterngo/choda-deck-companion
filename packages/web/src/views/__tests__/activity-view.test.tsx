// TASK-2153 — the Activity view over GET /activity/digests.
//
// fetch is stubbed rather than the hook, so the real useActivity + react-query
// path runs (the use-projects lesson: a mocked hook proves nothing about the hook).
// State primitives are asserted by data-testid, never by copy alone.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { HealthView } from "../../hooks/use-health";
import type { ActivityDigest } from "../../api";

let outletValue: HealthView = {
  health: { loopAlive: true, lastPullAgeSec: 5, jwtState: "refresh", reachable: true },
  conn: "connected",
  lastFetchedAgoSec: 2,
};

vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useOutletContext: () => outletValue,
}));

const { ActivityView } = await import("../ActivityView");

function digest(date: string, over: Partial<ActivityDigest["metrics"]> = {}): ActivityDigest {
  return {
    date,
    metrics: {
      prompts: 100,
      confirmationRate: 0.08,
      waitMinutes: 200,
      activeMinutes: 460,
      projectSwitches: 60,
      switchesPerActiveHour: 7.8,
      unresolvedPrompts: 10,
      sessionsCompleted: 3,
      mergesToDefault: 20,
      ...over,
    },
  };
}

let requested: string[] = [];

function serve(body: unknown): void {
  vi.stubGlobal("fetch", async (input: RequestInfo) => {
    requested.push(String(input));
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  });
}

function mount(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ActivityView />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ActivityView (TASK-2153)", () => {
  beforeEach(() => {
    requested = [];
    outletValue = { ...outletValue, conn: "connected" };
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("AC-2: with no digests, shows an empty state naming the CLI command and renders no chart", async () => {
    serve([]);
    mount();
    const empty = await screen.findByText(/No digests yet/);
    expect(empty).toBeTruthy();
    expect(screen.getByText(/choda-deck activity digest/)).toBeTruthy();
    expect(screen.queryAllByTestId(/^trend-/)).toHaveLength(0);
    expect(screen.queryByTestId("activity-table")).toBeNull();
    expect(requested.some((u) => u.endsWith("/activity/digests"))).toBe(true);
  });

  it("AC-3: with 3 digests, renders 4 trends of 3 points each and a 3-row table in ascending date order", async () => {
    // Deliberately out of order: the view must sort, not trust the wire order.
    serve([digest("2026-09-25"), digest("2026-09-23"), digest("2026-09-24")]);
    mount();
    await waitFor(() => expect(screen.getByTestId("activity-table")).toBeTruthy());
    for (const key of ["shipped", "confirmation", "wait", "switches"]) {
      const fig = screen.getByTestId(`trend-${key}`);
      expect(fig.querySelectorAll('[data-testid="trend-point"]')).toHaveLength(3);
    }
    const rows = screen.getAllByTestId(/^activity-row-/).map((r) => r.getAttribute("data-testid"));
    expect(rows).toEqual(["activity-row-2026-09-23", "activity-row-2026-09-24", "activity-row-2026-09-25"]);
  });

  it("shows the latest value of each metric, formatted", async () => {
    serve([digest("2026-09-24"), digest("2026-09-25", { waitMinutes: 207.1, activeMinutes: 460, confirmationRate: 0.08 })]);
    mount();
    await waitFor(() => expect(screen.getByTestId("trend-wait")).toBeTruthy());
    expect(screen.getByTestId("trend-wait").textContent).toContain("207 of 460 min");
    expect(screen.getByTestId("trend-confirmation").textContent).toContain("8%");
    expect(screen.getByTestId("trend-shipped").textContent).toContain("23");
  });

  it("an unreachable adapter is not rendered as an empty history", () => {
    outletValue = { ...outletValue, conn: "disconnected" };
    serve([]);
    mount();
    expect(screen.queryByText(/No digests yet/)).toBeNull();
    expect(screen.getByText(/not an empty history/)).toBeTruthy();
  });
});
