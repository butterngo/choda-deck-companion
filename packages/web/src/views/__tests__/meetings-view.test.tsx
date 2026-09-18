// TASK-1966 — the Meetings view's list states, and the recorder living above it.
//
// AC-4 is the one machine-checkable criterion: a 404 from GET /meetings means the
// installed app's vendored adapter predates the route, and that must not render as
// "No recordings yet". The pair of tests below is the discriminator — each asserts
// its own state is present AND the other state is absent, so a view that rendered
// the same thing for both would fail one of them.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes, Link } from "react-router-dom";
import { MeetingsView } from "../MeetingsView";
import { CaptureView } from "../CaptureView";
import { RecorderProvider, useRecorder } from "../../hooks/use-recorder";
import { Shell } from "../../layouts/Shell";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/** Shell reads health through react-query; a fresh client per render, no retries. */
function withQuery(ui: React.ReactNode): React.JSX.Element {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

let meetingsStatus = 200;
let meetingsBody: unknown = [];

beforeEach(() => {
  meetingsStatus = 200;
  meetingsBody = [];
  try {
    localStorage.clear();
  } catch {
    /* storage unavailable in this environment */
  }
  vi.stubGlobal("fetch", async (input: RequestInfo) => {
    const url = String(input);
    if (url.endsWith("/api/meetings")) {
      return new Response(JSON.stringify(meetingsBody), {
        status: meetingsStatus,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("{}", { status: 404 });
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderView(): void {
  render(
    <MemoryRouter>
      <RecorderProvider>
        <MeetingsView />
      </RecorderProvider>
    </MemoryRouter>,
  );
}

describe("TASK-1966 AC-4 — a stale adapter is a capability gap, not an empty list", () => {
  it("renders the capability note, and NOT the empty state, when GET /meetings is 404", async () => {
    meetingsStatus = 404;
    meetingsBody = { error: "not found" };
    renderView();

    const note = await screen.findByTestId("capability-note");
    expect(note.textContent).toMatch(/adapter/i);
    expect(screen.queryByTestId("empty-state")).toBeNull();
    // Recording into storage that does not exist would fail on the first chunk.
    expect(screen.getByRole("button", { name: /record meeting/i })).toHaveProperty("disabled", true);
  });

  it("renders the empty state, and NOT the capability note, when the list is genuinely empty", async () => {
    meetingsStatus = 200;
    meetingsBody = [];
    renderView();

    expect(await screen.findByTestId("empty-state")).toBeTruthy();
    expect(screen.queryByTestId("capability-note")).toBeNull();
    expect(screen.getByRole("button", { name: /record meeting/i })).toHaveProperty("disabled", false);
  });

  it("renders a failure, and neither of the other two, on a 500", async () => {
    meetingsStatus = 500;
    meetingsBody = { error: "boom" };
    renderView();

    await waitFor(() => expect(screen.queryByTestId("skeleton")).toBeNull());
    expect(screen.queryByTestId("empty-state")).toBeNull();
    expect(screen.queryByTestId("capability-note")).toBeNull();
    expect(screen.getByText(/meetings listing failed: 500/)).toBeTruthy();
  });

  it("lists recordings newest first with a player per recorded track", async () => {
    meetingsBody = [
      { id: "m-new", startedAt: "2026-09-16T09:00:00.000Z", endedAt: "2026-09-16T09:30:00.000Z", tracks: ["loopback", "mic"], bytes: 2048 },
      { id: "m-old", startedAt: "2026-09-15T09:00:00.000Z", endedAt: "2026-09-15T09:05:00.000Z", tracks: ["loopback"], bytes: 1024 },
    ];
    renderView();

    const list = await screen.findByTestId("meetings-list");
    // TASK-2005 — players mount on expand, so open both rows first. Newest-first
    // ordering is still read off the list, which is what this criterion is about.
    for (const row of list.querySelectorAll("li")) fireEvent.click(row.querySelector("button") as HTMLElement);
    const audio = list.querySelectorAll("audio");
    expect(audio.length).toBe(3);
    expect(audio[0].getAttribute("src")).toBe("/api/artifacts/meetings/m-new/loopback.webm");
  });
});

/**
 * Supporting evidence for AC-1 — not a substitute for it. AC-1 is a human check
 * in the running app. What a test CAN prove is the architecture it depends on:
 * the recorder must be provided by SHELL, above the outlet, so it survives route
 * changes. This renders the real Shell, so removing RecorderProvider from Shell
 * makes useRecorder throw in the child routes and fails the test. An earlier
 * version built its own provider inside the test and could not fail that way.
 */
function RecorderProbe({ label }: { label: string }): React.JSX.Element {
  const rec = useRecorder();
  return <span data-testid="probe">{`${label}:${rec.status}`}</span>;
}

describe("TASK-1966 — Shell provides the recorder to every route", () => {
  it("resolves the recorder on one route and still resolves it after navigating to another", async () => {
    render(
      withQuery(
        <MemoryRouter initialEntries={["/a"]}>
          <Routes>
            <Route path="/" element={<Shell />}>
              <Route path="a" element={<><RecorderProbe label="a" /><Link to="/b">go</Link></>} />
              <Route path="b" element={<RecorderProbe label="b" />} />
            </Route>
          </Routes>
        </MemoryRouter>,
      ),
    );
    expect((await screen.findByTestId("probe")).textContent).toBe("a:idle");
    screen.getByText("go").click();
    await waitFor(() => expect(screen.getByTestId("probe").textContent).toBe("b:idle"));
  });

  it("renders no indicator while idle — the strip only appears for a live recording", async () => {
    render(
      withQuery(
        <MemoryRouter initialEntries={["/a"]}>
          <Routes>
            <Route path="/" element={<Shell />}>
              <Route path="a" element={<RecorderProbe label="a" />} />
            </Route>
          </Routes>
        </MemoryRouter>,
      ),
    );
    await screen.findByTestId("probe");
    expect(screen.queryByTestId("recording-indicator")).toBeNull();
  });
});

/**
 * The Meeting tab of Capture is the ONLY way into this feature — TASK-1830 rules
 * out a sidebar entry. If this breaks, recording becomes unreachable and nothing
 * else in the suite would notice.
 */
describe("TASK-1966 — Capture is the way in", () => {
  function renderCapture(path: string): void {
    render(
      withQuery(
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/" element={<Shell />}>
              <Route path="capture" element={<CaptureView />} />
            </Route>
          </Routes>
        </MemoryRouter>,
      ),
    );
  }

  it("opens on Screenshot by default, with no recorder controls", async () => {
    renderCapture("/capture");
    expect((await screen.findByTestId("capture-tab-screenshot")).getAttribute("aria-selected")).toBe("true");
    expect(screen.queryByRole("button", { name: /record meeting/i })).toBeNull();
  });

  it("deep-links to the Meeting tab via ?mode=meeting and shows the recorder", async () => {
    renderCapture("/capture?mode=meeting");
    expect((await screen.findByTestId("capture-tab-meeting")).getAttribute("aria-selected")).toBe("true");
    expect(await screen.findByRole("button", { name: /record meeting/i })).toBeTruthy();
  });
});
