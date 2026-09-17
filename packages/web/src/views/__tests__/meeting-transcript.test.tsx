// TASK-1993 — the Transcribe button, its failure states, and the ▶ seek.
//
// fetch is replaced with a recorder, so "zero requests" and "exactly one" are
// counted rather than assumed. The seek is observed on the real <audio> elements
// the row renders: jsdom does not implement media playback, so currentTime is
// given a plain backing field and play() a no-op — the assertion is still about
// what the component SET, on the elements it actually rendered.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { MeetingRow } from "../MeetingRow";
import type { MeetingMeta } from "../../api";

let calls: Array<{ url: string; method: string }> = [];
let transcribeStatus = 200;
let transcribeBody: unknown = {};
let storedTranscript: unknown = null;

const MEETING: MeetingMeta = {
  id: "m1",
  startedAt: "2026-09-17T07:37:25.846Z",
  endedAt: "2026-09-17T08:02:57.151Z",
  tracks: ["mic", "loopback"],
  bytes: 49542308,
  transcribedAt: null,
};

const TRANSCRIPT = {
  meetingId: "m1",
  createdAt: "2026-09-17T09:00:00.000Z",
  segments: [
    { track: "mic", speaker: "Me", startMs: 160, endMs: 9000, text: "cho em hỏi", locale: "vi-VN" },
    { track: "loopback", speaker: "Them", startMs: 754000, endMs: 760000, text: "chốt cái phần đó", locale: "vi-VN" },
  ],
};

beforeEach(() => {
  calls = [];
  transcribeStatus = 200;
  transcribeBody = TRANSCRIPT;
  storedTranscript = null;

  // jsdom has no media pipeline: give currentTime a real backing field per
  // element and make play() a no-op, so what the component sets can be read back.
  const times = new WeakMap<HTMLMediaElement, number>();
  Object.defineProperty(HTMLMediaElement.prototype, "currentTime", {
    configurable: true,
    get() {
      return times.get(this) ?? 0;
    },
    set(v: number) {
      times.set(this, v);
    },
  });
  Object.defineProperty(HTMLMediaElement.prototype, "play", {
    configurable: true,
    value: () => Promise.resolve(),
  });

  vi.stubGlobal("fetch", async (input: RequestInfo, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, method: init?.method ?? "GET" });
    if (url.endsWith("/transcribe")) {
      return new Response(JSON.stringify(transcribeBody), {
        status: transcribeStatus,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.endsWith("/transcript.json") && storedTranscript) {
      return new Response(JSON.stringify(storedTranscript), { status: 200 });
    }
    return new Response("{}", { status: 404 });
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderRow(meeting: MeetingMeta = MEETING): void {
  render(
    <ul>
      <MeetingRow meeting={meeting} />
    </ul>,
  );
}

const transcribeCalls = (): number => calls.filter((c) => c.url.endsWith("/meetings/m1/transcribe")).length;

describe("AC-1 — a ▶ timestamp seeks BOTH tracks", () => {
  it("clicking ▶ 12:34 puts mic and loopback within 0.5 s of 754", async () => {
    // The stored transcript is read on mount, so it must exist before render.
    storedTranscript = TRANSCRIPT;
    renderRow({ ...MEETING, transcribedAt: "2026-09-17T09:00:00.000Z" });
    const button = await screen.findByRole("button", { name: /play from 12:34/i });
    const audio = Array.from(document.querySelectorAll("audio"));
    expect(audio.map((a) => a.dataset.track).sort()).toEqual(["loopback", "mic"]);

    fireEvent.click(button);

    for (const a of audio) {
      expect(Math.abs(a.currentTime - 754)).toBeLessThanOrEqual(0.5);
    }
  });
});

describe("AC-2 — transcription is sent only on a click, exactly once", () => {
  it("mount sends nothing; one click sends exactly one request", async () => {
    renderRow();
    expect(await screen.findByTestId("transcript-none")).toBeTruthy();
    expect(transcribeCalls()).toBe(0);

    fireEvent.click(screen.getByRole("button", { name: /^transcribe$/i }));
    await screen.findByTestId("transcript");
    expect(transcribeCalls()).toBe(1);
    expect(calls.find((c) => c.url.endsWith("/transcribe"))?.method).toBe("POST");
  });
});

describe("AC-3 — 501, 404 and 502 are three different messages, none of them 'not yet'", () => {
  async function stateFor(status: number, body: unknown): Promise<string> {
    transcribeStatus = status;
    transcribeBody = body;
    renderRow();
    fireEvent.click(await screen.findByRole("button", { name: /^transcribe$/i }));
    await waitFor(() => expect(screen.queryByText(/transcribing/i)).toBeNull());
    expect(screen.queryByTestId("transcript-none")).toBeNull();
    const text = (screen.getByTestId("meeting-m1").querySelector(".mt-3")?.textContent ?? "").trim();
    cleanup();
    return text;
  }

  it("renders three distinct visible messages", async () => {
    const unconfigured = await stateFor(501, { error: "speech not configured" });
    const missing = await stateFor(404, { error: "not found" });
    const failed = await stateFor(502, { error: "transcription failed", detail: "mic: HTTP 500" });

    expect(unconfigured).toMatch(/not configured/i);
    expect(missing).toMatch(/adapter/i);
    expect(failed).toMatch(/mic: HTTP 500/);
    expect(new Set([unconfigured, missing, failed]).size).toBe(3);
  });
});
