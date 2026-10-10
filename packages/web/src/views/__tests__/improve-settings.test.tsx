// TASK-2360 — the improve settings form, reached the way a user reaches it:
// Improve tab → Cài đặt. fetch is stubbed (not the hooks), so the PUT asserted
// here is the request the adapter would receive, and "reopen" is a real second
// GET that returns what was saved.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { HealthView } from "../../hooks/use-health";
import type { ImproveConfig, ImproveOverview } from "../../api";

const outletValue: HealthView = {
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
  flows: [{ name: "search-to-task", steps: "search, open", spec: "packages/web/e2e/search-to-task.spec.ts" }],
  criteria: [
    { name: "Test pass rate", by: "auto", measure: "test", target: "100%" },
    { name: "Console errors", by: "auto", measure: "console:/#/projects", target: 0 },
    { name: "UI scannable", by: "agent", measure: "Scannable at a glance", target: "≥ 4/5", good: true },
  ],
  model: "sonnet",
  maxProposals: 3,
  stopAfterFlat: 3,
};

interface Seen {
  method: string;
  url: string;
  body: unknown;
}
let seen: Seen[] = [];
let stored: ImproveConfig | null = CONFIG;
let putAnswer: { status: number; body: unknown } | null = null;

function overview(): ImproveOverview {
  return { config: stored, configError: null, scorecards: [], runs: [], rejected: [], proposals: [] };
}

function serve(): void {
  vi.stubGlobal("fetch", async (input: RequestInfo, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    seen.push({ method, url, body });
    const json = (status: number, b: unknown): Response =>
      new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
    if (method === "GET") return json(200, overview());
    if (method === "PUT") {
      if (putAnswer) return json(putAnswer.status, putAnswer.body);
      stored = body as ImproveConfig;
      return json(200, { config: body });
    }
    return json(404, { error: "not found" });
  });
}

async function openSettings(): Promise<void> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ImproveTab workspaceId={WS} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByTestId("improve-open-settings"));
  await screen.findByTestId("improve-settings");
}

const val = (id: string): string => (screen.getByTestId(id) as HTMLInputElement).value;
const puts = (): Seen[] => seen.filter((s) => s.method === "PUT");

/** Every field the form shows, read back off the DOM. */
function snapshot(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const id of [
    "improve-url",
    "improve-start-cmd",
    "improve-test-cmd",
    "improve-pages",
    "improve-model",
    "improve-max-proposals",
    "improve-stop-after-flat",
  ]) {
    out[id] = val(id);
  }
  document.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-testid^="improve-crit-"], [data-testid^="improve-flow-"]').forEach((el) => {
    if ("value" in el && (el.tagName === "INPUT" || el.tagName === "SELECT")) out[el.dataset.testid ?? ""] = el.value;
  });
  const mode = document.querySelector('[data-testid^="improve-settings-mode-"][aria-checked="true"]');
  out.mode = mode?.getAttribute("data-testid") ?? "";
  return out;
}

describe("ImproveSettings (TASK-2360)", () => {
  beforeEach(() => {
    seen = [];
    stored = CONFIG;
    putAnswer = null;
    serve();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("AC-1: Save sends PUT /improve/:ws/config, and reopening shows the same values in every field", async () => {
    await openSettings();
    fireEvent.change(screen.getByTestId("improve-url"), { target: { value: "http://localhost:4000" } });
    fireEvent.change(screen.getByTestId("improve-pages"), { target: { value: "/#/sync\n/#/activity\n/#/projects" } });
    fireEvent.change(screen.getByTestId("improve-crit-target-1"), { target: { value: "2" } });
    fireEvent.change(screen.getByTestId("improve-crit-by-2"), { target: { value: "you" } });
    fireEvent.click(screen.getByTestId("improve-settings-mode-scheduled"));
    fireEvent.change(screen.getByTestId("improve-max-proposals"), { target: { value: "5" } });
    const before = snapshot();
    fireEvent.click(screen.getByTestId("improve-settings-save"));

    await waitFor(() => expect(puts()).toHaveLength(1));
    const put = puts()[0];
    expect(put?.url).toBe(`/api/improve/${WS}/config`);
    expect(put?.body).toEqual({
      ...CONFIG,
      url: "http://localhost:4000",
      pages: ["/#/sync", "/#/activity", "/#/projects"],
      criteria: [CONFIG.criteria[0], { ...CONFIG.criteria[1], target: 2 }, { ...CONFIG.criteria[2], by: "you" }],
      mode: "scheduled",
      maxProposals: 5,
    });
    // A saved form closes back to the tab.
    await waitFor(() => expect(screen.queryByTestId("improve-settings")).toBeNull());

    // Reopen from scratch: a new mount, a new GET that returns what was saved.
    cleanup();
    await openSettings();
    expect(snapshot()).toEqual(before);
    expect(Object.keys(before).length).toBeGreaterThan(20);
  });

  it("CONTROL: opening and saving untouched sends back exactly the stored config", async () => {
    await openSettings();
    fireEvent.click(screen.getByTestId("improve-settings-save"));
    await waitFor(() => expect(puts()).toHaveLength(1));
    // Numbers stay numbers (target 0), "good" survives, empty optionals stay absent.
    expect(puts()[0]?.body).toEqual(CONFIG);
  });

  it('AC-2: a 400 for "criteria[1].target" shows its message under row 2\'s target input and nowhere else', async () => {
    putAnswer = {
      status: 400,
      body: { error: "is required", field: "criteria[1].target", errors: [{ field: "criteria[1].target", message: "is required" }] },
    };
    await openSettings();
    fireEvent.change(screen.getByTestId("improve-crit-target-1"), { target: { value: "" } });
    fireEvent.click(screen.getByTestId("improve-settings-save"));

    const msg = await screen.findByTestId("improve-crit-target-error-1");
    expect(msg.textContent).toBe("is required");
    // It sits in row 2 (index 1), in the target cell.
    expect(screen.getByTestId("improve-crit-1").contains(msg)).toBe(true);
    expect(msg.parentElement?.contains(screen.getByTestId("improve-crit-target-1"))).toBe(true);
    // And it is the only error on the page.
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.queryByTestId("improve-settings-errors")).toBeNull();
    // The form stays open with the reader's edit intact.
    expect(screen.getByTestId("improve-settings")).toBeTruthy();
  });

  it("AC-3: no project or workspace selector — the workspace is the route's", async () => {
    await openSettings();
    const pickers = screen.queryAllByRole("combobox").filter((el) =>
      /project|workspace/i.test(`${el.getAttribute("aria-label") ?? ""} ${el.getAttribute("data-testid") ?? ""}`),
    );
    expect(pickers).toHaveLength(0);
    expect(screen.queryByLabelText(/project|workspace/i)).toBeNull();
    fireEvent.click(screen.getByTestId("improve-settings-save"));
    await waitFor(() => expect(puts()).toHaveLength(1));
    expect(puts()[0]?.url).toBe(`/api/improve/${WS}/config`);
  });

  it("AC-4: a workspace with no config opens the form with Manual preselected", async () => {
    stored = null;
    await openSettings();
    expect(screen.getByTestId("improve-settings-mode-manual").getAttribute("aria-checked")).toBe("true");
    expect(screen.getByTestId("improve-settings-mode-off").getAttribute("aria-checked")).toBe("false");
    expect(screen.getByTestId("improve-settings-mode-scheduled").getAttribute("aria-checked")).toBe("false");
  });

  it("an error for a field no input owns is listed at the top, not dropped", async () => {
    putAnswer = { status: 400, body: { error: "must be an object", field: "", errors: [{ field: "", message: "must be an object" }] } };
    await openSettings();
    fireEvent.click(screen.getByTestId("improve-settings-save"));
    expect((await screen.findByTestId("improve-settings-errors")).textContent).toContain("must be an object");
  });

  it("quick chips add a criterion pointing at the first page", async () => {
    await openSettings();
    fireEvent.click(screen.getByTestId("improve-chip-a11y"));
    expect(val("improve-crit-measure-3")).toBe("axe:/#/sync");
    expect(val("improve-crit-by-3")).toBe("auto");
  });
});
