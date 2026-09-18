// TASK-1995 — sending a meeting note's action item to the inbox.
//
// The whole point of this feature is that NOTHING converts on its own: an inbox
// row is real work someone has to triage, and a note with six actions that
// silently became six rows is worse than no feature. So fetch is a recorder and
// every test counts /capture calls, including the zero ones.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { MeetingSave } from "../MeetingSave";
import type { MeetingMeta, TranscriptSegment } from "../../api";

type Call = { url: string; method: string; body: unknown };
let calls: Call[] = [];

const MEETING: MeetingMeta = {
  id: "m1",
  startedAt: "2026-09-17T07:37:25.846Z",
  endedAt: "2026-09-17T08:02:57.151Z",
  tracks: ["mic", "loopback"],
  bytes: 49542308,
  transcribedAt: "2026-09-17T10:21:27.580Z",
};

const SEGMENTS: TranscriptSegment[] = [
  { track: "loopback", speaker: "Them", startMs: 44000, endMs: 50000, text: "Còn cái này là em chỉ quan tâm", locale: "vi-VN" },
];

// Two actions, deliberately distinguishable: a test that clicks row 1 of a
// fixture whose rows read alike cannot fail (INBOX-1910).
const TWO_ACTIONS = {
  markdown: "# Chị Kate\n",
  dropped: [],
  note: {
    actions: [
      { text: "Gửi mapping competency", atMs: 120000, owner: "Me", due: null },
      { text: "Chốt lịch demo với Kate", atMs: 754000, owner: "Them", due: null },
    ],
  },
};

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
    calls.push({ url, method, body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined });
    if (url.endsWith("/api/projects")) return Response.json({ projects: [{ id: "mantu", name: "Mantu", cwd: "C:/vault" }] });
    if (url.endsWith("/api/workspaces")) {
      return Response.json({
        workspaces: [{ id: "abcv2", projectId: "mantu", label: "ABCV2", cwd: "C:/dev/mantu/ABCV2", archivedAt: null }],
      });
    }
    if (url.endsWith("/note/draft")) return Response.json(TWO_ACTIONS);
    if (url.endsWith("/capture")) return Response.json({ id: "INBOX-9001", destination: "inbox" });
    return new Response("{}", { status: 404 });
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const captures = (): Call[] => calls.filter((c) => c.url.endsWith("/capture"));

/** Renders the panel, picks a project, and drafts — the state every AC starts from. */
async function draftWithActions(): Promise<void> {
  render(<MeetingSave meeting={MEETING} segments={SEGMENTS} currentMs={() => 1040000} />);
  const picker = await screen.findByLabelText("Project or workspace");
  await waitFor(() => expect(picker.querySelectorAll("option").length).toBeGreaterThan(1));
  fireEvent.change(picker, { target: { value: "mantu::abcv2" } });
  fireEvent.change(screen.getByLabelText("Client"), { target: { value: "Chị Kate" } });
  fireEvent.click(screen.getByRole("button", { name: /draft note/i }));
  await screen.findByTestId("note-actions");
}

const sendButtons = (): HTMLElement[] => screen.getAllByRole("button", { name: /send to inbox|^sent$/i });

describe("AC-1 — nothing is sent without a click, and a click sends only its own item", () => {
  it("renders two actions with zero captures, then sends exactly the second", async () => {
    await draftWithActions();
    expect(captures()).toHaveLength(0);

    fireEvent.click(sendButtons()[1]);
    await waitFor(() => expect(captures()).toHaveLength(1));

    const payload = (captures()[0].body as { payload: { text: string } }).payload;
    expect(payload.text).toContain("Chốt lịch demo với Kate");
    expect(payload.text).not.toContain("Gửi mapping competency");
  });
});

describe("AC-2 — the inbox row leads back to the evidence", () => {
  it("an action at 754000 ms in meeting m1 ends with `— from meeting m1 ▶ 12:34`", async () => {
    await draftWithActions();
    fireEvent.click(sendButtons()[1]);
    await waitFor(() => expect(captures()).toHaveLength(1));

    const body = captures()[0].body as { kind: string; destination: string; payload: { text: string; projectId: string } };
    expect(body.payload.text.endsWith("— from meeting m1 ▶ 12:34")).toBe(true);
    expect(body.kind).toBe("text");
    expect(body.destination).toBe("inbox");
    expect(body.payload.projectId).toBe("mantu");
  });
});

describe("AC-3 — a sent action cannot be sent twice", () => {
  it("its button reads Sent, is disabled, and a further click makes no request", async () => {
    await draftWithActions();
    fireEvent.click(sendButtons()[0]);
    await waitFor(() => expect(captures()).toHaveLength(1));

    const button = sendButtons()[0] as HTMLButtonElement;
    expect(button.textContent).toContain("Sent");
    expect(button.disabled).toBe(true);

    fireEvent.click(button);
    // The second action stays sendable — "Sent" is per row, not per note.
    expect((sendButtons()[1] as HTMLButtonElement).disabled).toBe(false);
    expect(captures()).toHaveLength(1);
  });
});
