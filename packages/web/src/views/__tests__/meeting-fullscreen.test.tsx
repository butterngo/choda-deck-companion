// TASK-2045 — reading the transcript and the note at full window size.
//
// Two things here are easy to assert badly and are asserted carefully instead:
//
//   - "▶ works in the overlay" is proved by reading `currentTime` back off the
//     audio element, not by counting clicks on a mock. A seek that fired and
//     went nowhere would pass the mock version.
//   - "the players are not remounted" is proved by setting a playback position,
//     opening and closing the overlay, and finding the SAME position still
//     there. A remount resets it to 0, which is exactly what must not happen.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent, within } from "@testing-library/react";
import { MeetingRow, TranscriptList } from "../MeetingRow";
import { FullscreenOverlay } from "../../components/FullscreenOverlay";
import type { MeetingMeta, TranscriptSegment } from "../../api";

const SEGMENTS: TranscriptSegment[] = [
  { track: "loopback", speaker: "Them", startMs: 0, endMs: 4000, text: "chào anh", locale: "vi-VN" },
  { track: "mic", speaker: "Me", startMs: 65000, endMs: 70000, text: "về phạm vi assessment", locale: "vi-VN" },
  { track: "loopback", speaker: "Them", startMs: 891180, endMs: 895000, text: "ngày 2 tháng 6", locale: "vi-VN" },
];

function meta(over: Partial<MeetingMeta> = {}): MeetingMeta {
  return {
    id: "m-1",
    startedAt: "2026-09-17T08:29:00.000Z",
    endedAt: "2026-09-17T08:54:00.000Z",
    tracks: ["mic", "loopback"],
    bytes: 49 * 1024 * 1024,
    transcribedAt: "2026-09-17T09:00:00.000Z",
    title: "Kate — assessment scope",
    ...over,
  };
}

let transcriptBody: unknown = { meetingId: "m-1", segments: SEGMENTS };

beforeEach(() => {
  transcriptBody = { meetingId: "m-1", segments: SEGMENTS };
  // jsdom gives <audio> no real playback; currentTime is a plain property, which
  // is all these tests need — they assert what the code SET, not that sound came out.
  vi.stubGlobal("fetch", async (input: RequestInfo) => {
    const url = String(input);
    if (url.includes("transcript.json") || url.includes("/transcript")) {
      return new Response(JSON.stringify(transcriptBody), {
        status: 200,
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

async function openRow(over: Partial<MeetingMeta> = {}): Promise<void> {
  render(
    <ul>
      <MeetingRow meeting={meta(over)} />
    </ul>,
  );
  fireEvent.click(screen.getByRole("button", { expanded: false }));
  await screen.findByTestId("transcript");
}

describe("FullscreenOverlay", () => {
  // AC-1
  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(
      <FullscreenOverlay title="t" onClose={onClose}>
        <button type="button">inside</button>
      </FullscreenOverlay>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on the explicit control", () => {
    const onClose = vi.fn();
    render(
      <FullscreenOverlay title="t" onClose={onClose}>
        <button type="button">inside</button>
      </FullscreenOverlay>,
    );
    fireEvent.click(screen.getByTestId("fullscreen-close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // AC-2
  it("keeps Tab inside itself", () => {
    render(
      <>
        <button type="button" data-testid="outside">
          outside
        </button>
        <FullscreenOverlay title="t" onClose={() => {}}>
          <button type="button" data-testid="a">
            a
          </button>
          <button type="button" data-testid="b">
            b
          </button>
        </FullscreenOverlay>
      </>,
    );
    const close = screen.getByTestId("fullscreen-close");
    const b = screen.getByTestId("b");

    b.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    // Wrapped to the first control inside the overlay, not out to `outside`.
    expect(document.activeElement).toBe(close);

    close.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(b);
    expect(document.activeElement).not.toBe(screen.getByTestId("outside"));
  });
});

describe("the transcript, full screen", () => {
  // AC-3
  it("shows the same segments and seeks the audio from inside the overlay", async () => {
    await openRow();
    const audio = document.querySelector("audio") as HTMLAudioElement;
    expect(audio).not.toBeNull();

    fireEvent.click(screen.getByTestId("transcript-fullscreen"));
    const overlay = await screen.findByTestId("transcript-overlay");
    const full = within(overlay).getByTestId("transcript-full");
    expect(within(full).getAllByRole("listitem")).toHaveLength(SEGMENTS.length);

    // The last segment's stamp — 891180 ms, the one TASK-2011 repaired.
    fireEvent.click(within(full).getByLabelText("Play from 14:51"));

    // Read the position back off the element rather than trusting the click.
    for (const el of Array.from(document.querySelectorAll("audio"))) {
      expect((el as HTMLAudioElement).currentTime).toBeCloseTo(891.18, 2);
    }
  });

  // AC-4
  it("does not remount the players when it opens and closes", async () => {
    await openRow();
    const before = Array.from(document.querySelectorAll("audio")) as HTMLAudioElement[];
    before[0].currentTime = 123;

    fireEvent.click(screen.getByTestId("transcript-fullscreen"));
    await screen.findByTestId("transcript-overlay");
    fireEvent.click(screen.getByTestId("fullscreen-close"));
    await waitFor(() => expect(screen.queryByTestId("transcript-overlay")).toBeNull());

    const after = Array.from(document.querySelectorAll("audio")) as HTMLAudioElement[];
    // Same element objects, and the position the user was at is still there.
    expect(after[0]).toBe(before[0]);
    expect(after[0].currentTime).toBe(123);
  });

  // AC-5
  it("opens for a meeting whose audio was deleted, showing dead stamps", async () => {
    await openRow({ audioDeletedAt: "2026-09-18T00:00:00.000Z", bytes: 0 });

    fireEvent.click(screen.getByTestId("transcript-fullscreen"));
    const overlay = await screen.findByTestId("transcript-overlay");
    const full = within(overlay).getByTestId("transcript-full");

    expect(within(full).getAllByRole("listitem")).toHaveLength(SEGMENTS.length);
    // The stamps are text, not controls — there is nothing to seek.
    expect(within(full).queryByLabelText("Play from 14:51")).toBeNull();
    expect(full.textContent).toContain("14:51");
  });

  it("restores focus to the control that opened it", async () => {
    await openRow();
    const opener = screen.getByTestId("transcript-fullscreen");
    opener.focus();
    fireEvent.click(opener);
    await screen.findByTestId("transcript-overlay");

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByTestId("transcript-overlay")).toBeNull());
    expect(document.activeElement).toBe(opener);
  });
});

describe("TranscriptList is one component, used twice", () => {
  it("renders a seek control per segment when audio is present", () => {
    const seek = vi.fn();
    render(<TranscriptList segments={SEGMENTS} audioGone={false} seek={seek} />);
    fireEvent.click(screen.getByLabelText("Play from 01:05"));
    expect(seek).toHaveBeenCalledWith(65000);
  });

  it("renders plain stamps when the audio is gone", () => {
    const seek = vi.fn();
    render(<TranscriptList segments={SEGMENTS} audioGone={true} seek={seek} />);
    expect(screen.queryByLabelText("Play from 01:05")).toBeNull();
    expect(screen.getByTestId("transcript").textContent).toContain("01:05");
  });
});
