// TASK-2045 — the drafted note, rendered as markdown at full window size.
//
// The note had never been rendered as markdown anywhere; it lived as raw text in
// a monospace textarea. The discriminating assertions are therefore about
// RENDERING rather than about content: a table must come back as <table> and a
// heading as <h2>, because a preview that simply printed the same string would
// satisfy any test that only looked for the words.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { MeetingSave } from "../MeetingSave";
import type { MeetingMeta, TranscriptSegment } from "../../api";

const MARKDOWN = [
  "# Chị Kate",
  "",
  "## Quyết định",
  "",
  "| # | Nội dung | Lúc |",
  "| --- | --- | --- |",
  "| D1 | Chốt UI | ▶ 03:14 |",
  "",
  "- một gạch đầu dòng",
].join("\n");

let draftReply: unknown = { note: {}, markdown: MARKDOWN, dropped: [] };

const MEETING: MeetingMeta = {
  id: "m1",
  startedAt: "2026-09-17T07:37:25.846Z",
  endedAt: "2026-09-17T08:02:57.151Z",
  tracks: ["mic", "loopback"],
  bytes: 49542308,
  transcribedAt: "2026-09-17T10:21:27.580Z",
};

const SEGMENTS: TranscriptSegment[] = [
  { track: "loopback", speaker: "Them", startMs: 44000, endMs: 50000, text: "Còn cái này", locale: "vi-VN" },
];

beforeEach(() => {
  draftReply = { note: {}, markdown: MARKDOWN, dropped: [] };
  try {
    localStorage.clear();
  } catch {
    /* storage unavailable */
  }
  vi.stubGlobal("fetch", async (input: RequestInfo) => {
    const url = String(input);
    if (url.endsWith("/api/projects")) {
      return Response.json({ projects: [{ id: "mantu", name: "Mantu", cwd: "C:/vault" }] });
    }
    if (url.endsWith("/api/workspaces")) return Response.json({ workspaces: [] });
    if (url.endsWith("/note/draft")) return Response.json(draftReply);
    return new Response("{}", { status: 404 });
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Draft a note and return the editor, which is the only editing surface. */
async function draft(): Promise<HTMLTextAreaElement> {
  render(<MeetingSave meeting={MEETING} segments={SEGMENTS} currentMs={() => 0} />);
  const picker = await screen.findByLabelText("Project or workspace");
  await waitFor(() => expect(picker.querySelectorAll("option").length).toBeGreaterThan(1));
  fireEvent.change(picker, { target: { value: "mantu" } });
  fireEvent.change(screen.getByLabelText("Client"), { target: { value: "Chị Kate" } });
  fireEvent.click(screen.getByRole("button", { name: /draft note/i }));
  return (await screen.findByLabelText("Note draft")) as HTMLTextAreaElement;
}

describe("the note preview", () => {
  // AC-6
  it("renders markdown rather than showing its syntax", async () => {
    await draft();
    fireEvent.click(screen.getByTestId("note-preview-open"));
    const preview = await screen.findByTestId("note-preview");

    // A real table and a real heading — not the pipe characters and hashes.
    expect(within(preview).getByRole("table")).toBeInTheDocument();
    expect(within(preview).getByRole("heading", { level: 2, name: "Quyết định" })).toBeInTheDocument();
    expect(within(preview).getByRole("listitem")).toHaveTextContent("một gạch đầu dòng");
    // The literal syntax is gone from the rendered output.
    expect(preview.textContent).not.toContain("| --- |");
    expect(preview.textContent).not.toContain("## Quyết định");
  });

  // AC-7
  it("shows edits made before it was opened, and does not disturb them on close", async () => {
    const editor = await draft();
    const edited = editor.value.replace("Chốt UI", "Chốt UI — Tùng làm màn hình");
    fireEvent.change(editor, { target: { value: edited } });

    fireEvent.click(screen.getByTestId("note-preview-open"));
    const preview = await screen.findByTestId("note-preview");
    expect(preview.textContent).toContain("Tùng làm màn hình");

    fireEvent.click(screen.getByTestId("fullscreen-close"));
    await waitFor(() => expect(screen.queryByTestId("note-preview")).toBeNull());
    // The round trip: the editor still holds exactly what it held.
    expect((screen.getByLabelText("Note draft") as HTMLTextAreaElement).value).toBe(edited);
  });

  // AC-8
  it("is read-only — the textarea stays the only editor", async () => {
    await draft();
    fireEvent.click(screen.getByTestId("note-preview-open"));
    const preview = await screen.findByTestId("note-preview");

    expect(within(preview).queryByRole("textbox")).toBeNull();
    expect(preview.querySelector("textarea")).toBeNull();
    expect(preview.querySelector("[contenteditable='true']")).toBeNull();
  });

  it("closes on Escape and leaves the draft intact", async () => {
    const editor = await draft();
    const before = editor.value;
    fireEvent.click(screen.getByTestId("note-preview-open"));
    await screen.findByTestId("note-preview");

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByTestId("note-preview")).toBeNull());
    expect((screen.getByLabelText("Note draft") as HTMLTextAreaElement).value).toBe(before);
  });

  it("offers no preview before a note has been drafted", async () => {
    render(<MeetingSave meeting={MEETING} segments={SEGMENTS} currentMs={() => 0} />);
    await screen.findByLabelText("Project or workspace");
    expect(screen.queryByTestId("note-preview-open")).toBeNull();
  });
});
