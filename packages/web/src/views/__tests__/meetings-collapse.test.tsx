// TASK-2005 — the meetings list is one line per meeting until you open one.
//
// The criterion that carries the feature is AC-4: collapsing must not discard an
// edited note draft. That draft is minutes of reading and correcting, and a
// collapse that unmounts it would lose the work silently and re-charge a model
// call to get a worse version back. So the body is hidden, never unmounted —
// and the tests below assert both halves: nothing mounts before the first open,
// and nothing is lost after it.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { MeetingRow } from "../MeetingRow";
import type { MeetingMeta } from "../../api";

type Call = { url: string; method: string };
let calls: Call[] = [];

function meetingAt(n: number, transcribed: boolean): MeetingMeta {
  return {
    id: `m${n}`,
    startedAt: `2026-09-1${n}T07:37:25.846Z`,
    endedAt: `2026-09-1${n}T08:02:57.151Z`,
    tracks: ["mic", "loopback"],
    bytes: 49542308,
    transcribedAt: transcribed ? `2026-09-1${n}T10:21:27.580Z` : null,
  };
}

const SIX = [0, 1, 2, 3, 4, 5].map((n) => meetingAt(n, n === 0));

beforeEach(() => {
  calls = [];
  try {
    localStorage.clear();
  } catch {
    /* storage unavailable */
  }
  vi.stubGlobal("fetch", async (input: RequestInfo, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, method: init?.method ?? "GET" });
    if (url.includes("/transcript")) {
      return Response.json({
        segments: [{ track: "loopback", speaker: "Them", startMs: 44000, endMs: 50000, text: "Còn cái này", locale: "vi-VN" }],
      });
    }
    if (url.endsWith("/api/projects")) return Response.json({ projects: [{ id: "mantu", name: "Mantu", cwd: "C:/v" }] });
    if (url.endsWith("/api/workspaces")) return Response.json({ workspaces: [] });
    if (url.endsWith("/note/draft")) {
      return Response.json({ markdown: "# draft\nline one\n", dropped: [], note: { actions: [] } });
    }
    return new Response("{}", { status: 404 });
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderList(meetings: MeetingMeta[] = SIX): HTMLElement {
  const { container } = render(
    <ul>
      {meetings.map((m) => (
        <MeetingRow key={m.id} meeting={m} />
      ))}
    </ul>,
  );
  return container;
}

const rowOf = (id: string): HTMLElement => screen.getByTestId(`meeting-${id}`);
const toggleOf = (id: string): HTMLElement => within(rowOf(id)).getAllByRole("button")[0];

/** The row header is the only button present while collapsed. */
function openRow(id: string): void {
  fireEvent.click(within(rowOf(id)).getAllByRole("button")[0]);
}

describe("AC-1 — every row starts collapsed and mounts nothing", () => {
  it("six meetings render with no players, no transcript and no save panel", () => {
    const container = renderList();
    expect(container.querySelectorAll("audio")).toHaveLength(0);
    expect(screen.queryAllByTestId("transcript")).toHaveLength(0);
    expect(screen.queryAllByTestId("meeting-save")).toHaveLength(0);
    expect(screen.queryAllByTestId("meeting-body")).toHaveLength(0);
    // The one line still carries what the list is triaged by.
    expect(within(rowOf("m0")).getByTestId("meeting-status")).toHaveTextContent("Transcribed");
    expect(rowOf("m0").textContent).toContain("26 minutes");
    expect(rowOf("m0").textContent).toContain("47.2 MB");
  });
});

describe("AC-2 — opening one row opens only that row", () => {
  it("m1's players mount; the other five stay collapsed", async () => {
    const container = renderList();
    openRow("m1");
    await waitFor(() => expect(rowOf("m1").querySelectorAll("audio")).toHaveLength(2));
    expect(container.querySelectorAll("audio")).toHaveLength(2);
    expect(screen.getAllByTestId("meeting-body")).toHaveLength(1);
  });
});

describe("AC-3 — two rows may be open at once", () => {
  it("opening a second leaves the first open; collapsing the first leaves the second open", async () => {
    renderList();
    openRow("m1");
    openRow("m2");
    await waitFor(() => expect(screen.getAllByTestId("meeting-body")).toHaveLength(2));
    expect(toggleOf("m1")).toHaveAttribute("aria-expanded", "true");
    expect(toggleOf("m2")).toHaveAttribute("aria-expanded", "true");

    openRow("m1"); // collapse it again
    expect(toggleOf("m1")).toHaveAttribute("aria-expanded", "false");
    expect(toggleOf("m2")).toHaveAttribute("aria-expanded", "true");
    expect(within(rowOf("m2")).getByTestId("meeting-body").hidden).toBe(false);
  });
});

describe("AC-4 — collapsing does not discard an edited note draft", () => {
  it("the edited text survives a collapse/expand and no second draft is requested", async () => {
    renderList([meetingAt(0, true)]);
    openRow("m0");
    await screen.findByTestId("transcript");

    fireEvent.change(await screen.findByLabelText("Client"), { target: { value: "Chị Kate" } });
    fireEvent.click(screen.getByRole("button", { name: /draft note/i }));
    const editor = (await screen.findByLabelText("Note draft")) as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: "# draft\nline one, corrected by hand\n" } });
    const draftsBefore = calls.filter((c) => c.url.endsWith("/note/draft")).length;
    expect(draftsBefore).toBe(1);

    openRow("m0"); // collapse
    expect(screen.getByTestId("meeting-body").hidden).toBe(true);
    openRow("m0"); // expand again

    expect((screen.getByLabelText("Note draft") as HTMLTextAreaElement).value).toContain("corrected by hand");
    expect(calls.filter((c) => c.url.endsWith("/note/draft"))).toHaveLength(1);
  });
});

describe("AC-5 — a collapsed row still says it is transcribed", () => {
  it("reads Transcribed without the transcript ever being fetched", () => {
    renderList([meetingAt(0, true)]);
    expect(screen.getByTestId("meeting-status")).toHaveTextContent("Transcribed");
    expect(calls.filter((c) => c.url.includes("/transcript"))).toHaveLength(0);
  });
});
