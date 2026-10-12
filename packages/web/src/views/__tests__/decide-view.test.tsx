// TASK-2381 — the "Needs your decision" screen over GET /inbox/pending (TASK-2380).
//
// fetch is stubbed rather than the hooks, so the real react-query path runs and
// every write assertion reads the request the adapter would receive.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { HealthView } from "../../hooks/use-health";
import type { AttentionSession, PendingItem } from "../../api";

let outletValue: HealthView = {
  health: { loopAlive: true, lastPullAgeSec: 5, jwtState: "refresh", reachable: true },
  conn: "connected",
  lastFetchedAgoSec: 2,
};

vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useOutletContext: () => outletValue,
}));

const { DecideView } = await import("../DecideView");

// Served newest-first by source, as the adapter does: the improve item is
// listed FIRST here on purpose, so only the view's own block order can put the
// digest on top.
const ITEMS: PendingItem[] = [
  {
    id: "INBOX-9002",
    source: "improve",
    workspaceId: "choda-deck-companion",
    title: "Stop the last project row from being clipped",
    content: "[improve:choda-deck-companion] Stop the last project row from being clipped",
    createdAt: "2026-10-11T04:00:00Z",
  },
  {
    id: "INBOX-9001",
    source: "activity-digest",
    workspaceId: null,
    title: "Tuần 2026-W41: notify when a long turn ends",
    content: "[activity-digest] Tuần 2026-W41: notify when a long turn ends\nWhy: waiting 45%",
    createdAt: "2026-10-06T02:00:00Z",
  },
];

interface Seen {
  method: string;
  url: string;
  body: unknown;
}
let seen: Seen[] = [];
let served: PendingItem[] = ITEMS;
let sessions: AttentionSession[] = [];

function serve(): void {
  vi.stubGlobal("fetch", async (input: RequestInfo, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    seen.push({ method, url, body });
    const json = (b: unknown): Response =>
      new Response(JSON.stringify(b), { status: 200, headers: { "content-type": "application/json" } });
    if (method === "GET" && url.endsWith("/attention")) return json({ sessions });
    if (method === "GET") return json({ items: served });
    if (url.endsWith("/convert")) return json({ inboxId: "INBOX-9001", taskId: "TASK-9999" });
    return json({ inboxId: "INBOX-9001", archived: true });
  });
}

function mount(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <DecideView />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const writes = (): Seen[] => seen.filter((s) => s.method !== "GET");

describe("DecideView (TASK-2381)", () => {
  beforeEach(() => {
    seen = [];
    served = ITEMS;
    sessions = [];
    outletValue = { ...outletValue, conn: "connected" };
    serve();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("AC-1: the digest block renders above the improve block and its item is the first row", async () => {
    mount();
    const digest = await screen.findByTestId("decide-block-digest");
    const improve = screen.getByTestId("decide-block-improve");
    expect(digest.compareDocumentPosition(improve) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const rows = screen.getAllByTestId(/^decide-item-/);
    expect(rows[0]?.getAttribute("data-testid")).toBe("decide-item-INBOX-9001");
    expect(seen[0]?.url).toBe("/api/inbox/pending");
  });

  it("AC-2: Approve calls POST /inbox/:id/convert and links the new task", async () => {
    mount();
    fireEvent.click(await screen.findByTestId("decide-convert-INBOX-9001"));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toMatchObject({ method: "POST", url: "/api/inbox/INBOX-9001/convert" });
    expect((await screen.findByRole("status")).textContent).toContain("TASK-9999");
  });

  it("AC-2: Dismiss sends { reason }, and an empty reason sends nothing", async () => {
    mount();
    fireEvent.click(await screen.findByTestId("decide-archive-INBOX-9001"));
    const save = screen.getByTestId("decide-archive-save-INBOX-9001") as HTMLButtonElement;
    fireEvent.change(screen.getByTestId("decide-reason-INBOX-9001"), { target: { value: "   " } });
    expect(save.disabled).toBe(true);
    fireEvent.click(save);
    await new Promise((r) => setTimeout(r, 20));
    expect(writes()).toHaveLength(0);

    fireEvent.change(screen.getByTestId("decide-reason-INBOX-9001"), {
      target: { value: " already have /next " },
    });
    fireEvent.click(save);
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toEqual({
      method: "POST",
      url: "/api/inbox/INBOX-9001/archive",
      body: { reason: "already have /next" },
    });
  });

  it("TASK-2384 AC-2: waiting sessions render below the digest block and above improve, with state and age", async () => {
    sessions = [
      {
        sessionId: "s1",
        cwd: "C:\\dev\\test\\headless-cms",
        workspaceId: "headless-cms",
        state: "waiting",
        since: new Date(Date.now() - 4 * 60_000).toISOString(),
      },
    ];
    mount();
    const block = await screen.findByTestId("decide-block-sessions");
    const digest = screen.getByTestId("decide-block-digest");
    const improve = screen.getByTestId("decide-block-improve");
    expect(digest.compareDocumentPosition(block) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(block.compareDocumentPosition(improve) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByTestId("decide-session-s1").textContent).toContain("headless-cms");
    expect(screen.getByTestId("decide-session-s1").textContent).toContain("waiting for permission / answer 4 min");
  });

  it("a session in no registered workspace is named by its folder, Windows path or not", async () => {
    sessions = [
      { sessionId: "w", cwd: "C:\\dev\\scratch\\demo", workspaceId: null, state: "finished", since: new Date().toISOString() },
      { sessionId: "p", cwd: "/home/b/proj", workspaceId: null, state: "finished", since: new Date().toISOString() },
    ];
    mount();
    expect((await screen.findByTestId("decide-session-w")).textContent).toContain("demo");
    expect(screen.getByTestId("decide-session-w").textContent).not.toContain("C:");
    expect(screen.getByTestId("decide-session-p").textContent).toContain("proj");
  });

  it("TASK-2384 AC-2: no waiting sessions → no sessions block", async () => {
    mount();
    await screen.findByTestId("decide-block-digest");
    expect(screen.queryByTestId("decide-block-sessions")).toBeNull();
  });

  it("AC-5: nothing pending shows an empty state naming the sources, not a blank page", async () => {
    served = [];
    mount();
    expect(await screen.findByText("Nothing waiting on you")).toBeTruthy();
    expect(screen.getByText(/daily digest and the improve loop/)).toBeTruthy();
  });

  it("AC-5: an unreachable adapter is not shown as nothing pending", () => {
    outletValue = { ...outletValue, conn: "disconnected" };
    mount();
    expect(screen.queryByText("Nothing waiting on you")).toBeNull();
    expect(screen.getByText(/not 'nothing waiting'/)).toBeTruthy();
  });
});
