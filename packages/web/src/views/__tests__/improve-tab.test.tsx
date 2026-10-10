// TASK-2359 — the Improve tab over GET /improve/:ws (choda-deck TASK-2357).
//
// fetch is stubbed rather than the hooks, so the real useImprove + react-query
// path runs, and every assertion about a write reads the request the adapter
// would actually have received: method, path and body.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { HealthView } from "../../hooks/use-health";
import type { ImproveConfig, ImproveOverview } from "../../api";

let outletValue: HealthView = {
  health: { loopAlive: true, lastPullAgeSec: 5, jwtState: "refresh", reachable: true },
  conn: "connected",
  lastFetchedAgoSec: 2,
};

vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useOutletContext: () => outletValue,
}));

const { ImproveTab } = await import("../ImproveTab");

const WS = "choda-deck-companion";

const CONFIG: ImproveConfig = {
  mode: "manual",
  url: "http://localhost:5173",
  startCmd: "pnpm dev",
  testCmd: "pnpm test",
  pages: ["/#/sync", "/#/projects"],
  flows: [],
  criteria: [
    { name: "Test pass rate", by: "auto", measure: "test", target: "100%" },
    { name: "Console errors", by: "auto", measure: "console:/#/projects", target: 0 },
    { name: "UI scannable", by: "agent", measure: "Scannable at a glance", target: "≥ 4/5" },
  ],
  model: "sonnet",
  maxProposals: 3,
  stopAfterFlat: 3,
};

function overview(over: Partial<ImproveOverview> = {}): ImproveOverview {
  return {
    config: CONFIG,
    configError: null,
    scorecards: [],
    runs: [],
    rejected: [],
    proposals: [
      {
        id: "INBOX-9001",
        content: `[improve:${WS}] Label the count column on the projects list`,
        status: "raw",
        createdAt: "2026-10-10T08:00:00Z",
      },
    ],
    ...over,
  };
}

interface Seen {
  method: string;
  url: string;
  body: unknown;
}
let seen: Seen[] = [];
let current: ImproveOverview = overview();

function serve(): void {
  vi.stubGlobal("fetch", async (input: RequestInfo, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    seen.push({ method, url, body });
    const json = (status: number, b: unknown): Response =>
      new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
    if (method === "GET") return json(200, current);
    if (url.endsWith("/config")) return json(200, { config: body });
    if (url.endsWith("/approve")) return json(200, { inboxId: "INBOX-9001", taskId: "TASK-9999" });
    if (url.endsWith("/reject")) return json(200, { inboxId: "INBOX-9001", rejected: 1 });
    return json(404, { error: "not found" });
  });
}

function mount(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ImproveTab workspaceId={WS} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const writes = (): Seen[] => seen.filter((s) => s.method !== "GET");

describe("ImproveTab (TASK-2359)", () => {
  beforeEach(() => {
    seen = [];
    current = overview();
    outletValue = { ...outletValue, conn: "connected" };
    serve();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads GET /improve/:ws for this workspace", async () => {
    mount();
    await screen.findByTestId("improve-tab");
    expect(seen[0]).toMatchObject({ method: "GET", url: `/api/improve/${WS}` });
  });

  it("AC-1: Approve calls POST /improve/:ws/proposals/:id/approve", async () => {
    mount();
    fireEvent.click(await screen.findByTestId("improve-approve-INBOX-9001"));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toMatchObject({
      method: "POST",
      url: `/api/improve/${WS}/proposals/INBOX-9001/approve`,
    });
  });

  it("AC-2: Reject with a typed reason calls POST …/reject with { reason }", async () => {
    mount();
    fireEvent.click(await screen.findByTestId("improve-reject-INBOX-9001"));
    const save = screen.getByTestId("improve-reject-save-INBOX-9001") as HTMLButtonElement;
    // No reason, no request: the reason is what keeps the idea from coming back.
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByTestId("improve-reject-reason-INBOX-9001"), {
      target: { value: "  numbers are obvious from context  " },
    });
    fireEvent.click(save);
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toEqual({
      method: "POST",
      url: `/api/improve/${WS}/proposals/INBOX-9001/reject`,
      body: { reason: "numbers are obvious from context" },
    });
  });

  it("AC-3: switching Off/Manual/Scheduled calls PUT /improve/:ws/config with the new mode", async () => {
    mount();
    fireEvent.click(await screen.findByTestId("improve-mode-scheduled"));
    await waitFor(() => expect(writes()).toHaveLength(1));
    const put = writes()[0];
    expect(put).toMatchObject({ method: "PUT", url: `/api/improve/${WS}/config` });
    // The whole config goes back — the route validates a complete file, not a patch.
    expect(put?.body).toEqual({ ...CONFIG, mode: "scheduled" });
  });

  it("CONTROL: clicking the mode already selected sends nothing", async () => {
    mount();
    fireEvent.click(await screen.findByTestId("improve-mode-manual"));
    await new Promise((r) => setTimeout(r, 20));
    expect(writes()).toHaveLength(0);
  });

  it("AC-4: config null renders the 'Chưa bật improve loop' empty state with a Settings button", async () => {
    current = overview({ config: null, proposals: [] });
    mount();
    expect(await screen.findByText("Chưa bật improve loop")).toBeTruthy();
    expect(screen.getByTestId("empty-state")).toBeTruthy();
    expect(screen.getByTestId("improve-open-settings")).toBeTruthy();
    expect(screen.queryByTestId("improve-tab")).toBeNull();
  });

  it("an invalid improve.json is named, not shown as 'not enabled'", async () => {
    current = overview({
      config: null,
      configError: [{ field: "criteria", message: "needs 3–8 criteria" }],
    });
    mount();
    expect(await screen.findByText("improve.json không hợp lệ")).toBeTruthy();
    expect(screen.queryByText("Chưa bật improve loop")).toBeNull();
    expect(screen.getByText(/criteria: needs 3–8 criteria/)).toBeTruthy();
  });

  it("ticking 'Đủ tốt' saves the config with that criterion marked good", async () => {
    mount();
    fireEvent.click(await screen.findByTestId("improve-good-Console errors"));
    await waitFor(() => expect(writes()).toHaveLength(1));
    const body = writes()[0]?.body as ImproveConfig;
    expect(body.criteria.map((c) => c.good === true)).toEqual([false, true, false]);
  });

  it("scorecard shows today's value and the change from the day before", async () => {
    const card = (date: string, commit: string, rate: number, errors: number) => ({
      ws: WS,
      date,
      generatedAt: `${date}T08:00:00Z`,
      commit,
      tests: null,
      pages: [],
      flows: [],
      criteria: [
        { name: "Test pass rate", by: "auto" as const, measure: "test", target: "100%", value: rate },
        { name: "Console errors", by: "auto" as const, measure: "console:/#/projects", target: 0, value: errors },
        { name: "UI scannable", by: "agent" as const, measure: "x", target: "≥ 4/5", value: 3.5, note: "Counts unlabelled." },
      ],
    });
    current = overview({ scorecards: [card("2026-10-09", "aaa", 0.99, 3), card("2026-10-10", "bbb", 1, 1)] });
    mount();
    const row = await screen.findByTestId("improve-criterion-Console errors");
    expect(row.textContent).toContain("1");
    expect(row.textContent).toContain("-2");
    expect(screen.getByTestId("improve-criterion-Test pass rate").textContent).toContain("+1");
    expect(screen.getByTestId("improve-criterion-UI scannable").textContent).toContain("3.5/5");
    // The commit changed between the two days, so the trend marks the second one.
    expect(screen.getAllByTestId("trend-marker").length).toBeGreaterThan(0);
  });

  it("an unreachable adapter is not shown as 'not enabled'", () => {
    outletValue = { ...outletValue, conn: "disconnected" };
    mount();
    expect(screen.queryByText("Chưa bật improve loop")).toBeNull();
    expect(screen.getByText(/not a workspace without one/)).toBeTruthy();
  });
});
