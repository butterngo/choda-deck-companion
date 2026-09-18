// TASK-2003 — deleting a meeting's audio from the row, and what the row looks
// like afterwards.
//
// AC-7 is the control for AC-6. Without it, a row that rendered no players at
// all would pass "a deleted-audio row mounts no player" while being broken for
// every meeting. The two are written as a pair on purpose.
//
// AC-8 is the one that protects the user: this is an irreversible deletion of
// their own recording, so the request must not exist before a confirmation does.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { MeetingRow } from "../MeetingRow";
import type { MeetingMeta } from "../../api";

type Call = { url: string; method: string };
let calls: Call[] = [];

function meeting(over: Partial<MeetingMeta> = {}): MeetingMeta {
  return {
    id: "m1",
    startedAt: "2026-09-17T07:37:25.846Z",
    endedAt: "2026-09-17T08:02:57.151Z",
    tracks: ["mic", "loopback"],
    bytes: 49542308,
    transcribedAt: "2026-09-17T10:21:27.580Z",
    ...over,
  };
}

beforeEach(() => {
  calls = [];
  try {
    localStorage.clear();
  } catch {
    /* storage unavailable */
  }
  vi.stubGlobal("fetch", async (input: RequestInfo, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ url, method });
    if (url.includes("/transcript")) {
      return Response.json({
        segments: [{ track: "loopback", speaker: "Them", startMs: 44000, endMs: 50000, text: "Còn cái này", locale: "vi-VN" }],
      });
    }
    if (url.endsWith("/audio") && method === "DELETE") return Response.json({ id: "m1", freedBytes: 49542308 });
    if (url.endsWith("/api/projects")) return Response.json({ projects: [] });
    if (url.endsWith("/api/workspaces")) return Response.json({ workspaces: [] });
    if (url.endsWith("/claude-config/models")) return Response.json({ models: [], selected: "" });
    return new Response("{}", { status: 404 });
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const deletes = (): Call[] => calls.filter((c) => c.method === "DELETE");

/** Renders the row and opens it — TASK-2005 made rows collapsed by default. */
async function openRow(m: MeetingMeta): Promise<HTMLElement> {
  const { container } = render(
    <ul>
      <MeetingRow meeting={m} />
    </ul>,
  );
  fireEvent.click(screen.getAllByRole("button")[0]);
  await screen.findByTestId("transcript");
  return container;
}

describe("AC-6 — a row whose audio is gone mounts no player and offers no seek", () => {
  it("shows the transcript in full, with timestamps that are not buttons", async () => {
    const container = await openRow(meeting({ audioDeletedAt: "2026-09-18T07:00:00.000Z", bytes: 0 }));

    expect(container.querySelectorAll("audio")).toHaveLength(0);
    expect(screen.queryByLabelText(/^Play from /)).toBeNull();
    expect(screen.getByTestId("audio-deleted")).toBeTruthy();
    // The evidence itself is untouched.
    expect(screen.getByTestId("transcript").textContent).toContain("Còn cái này");
    expect(screen.getByTestId("transcript").textContent).toContain("00:44");
  });
});

describe("AC-7 — the control: a row with audio still mounts its players", () => {
  it("one audio per track and the ▶ buttons are present", async () => {
    const container = await openRow(meeting());
    expect(container.querySelectorAll("audio")).toHaveLength(2);
    expect(screen.getByLabelText("Play from 00:44")).toBeTruthy();
    expect(screen.queryByTestId("audio-deleted")).toBeNull();
  });
});

describe("AC-8 — nothing is deleted until the question is answered", () => {
  it("asks first, names what is kept, and sends exactly one DELETE on confirm", async () => {
    await openRow(meeting());
    expect(deletes()).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: /delete audio, keep transcript/i }));
    const prompt = screen.getByTestId("delete-confirm");
    expect(prompt.textContent).toMatch(/transcript is kept/i);
    expect(prompt.textContent).toMatch(/cannot be recovered/i);
    // Asking is not doing.
    expect(deletes()).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: /^delete audio$/i }));
    await waitFor(() => expect(deletes()).toHaveLength(1));
    expect(deletes()[0].url).toContain("/meetings/m1/audio");

    // And the row converts to the deleted shape without a reload.
    await screen.findByTestId("audio-deleted");
    expect(screen.queryByLabelText(/^Play from /)).toBeNull();
  });

  it("Keep dismisses the question and deletes nothing", async () => {
    await openRow(meeting());
    fireEvent.click(screen.getByRole("button", { name: /delete audio, keep transcript/i }));
    fireEvent.click(screen.getByRole("button", { name: /^keep$/i }));
    expect(screen.queryByTestId("delete-confirm")).toBeNull();
    expect(deletes()).toHaveLength(0);
  });
});
