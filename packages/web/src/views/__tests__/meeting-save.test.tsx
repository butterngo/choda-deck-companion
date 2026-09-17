// TASK-1994 — the save/draft panel of a transcribed meeting.
//
// fetch is a recorder, so what was sent — and what was NOT sent before a press —
// is counted. The panel is rendered on its own; MeetingRow only mounts it under a
// ready transcript, which TASK-1993's tests already cover.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { MeetingSave } from "../MeetingSave";
import type { MeetingMeta, TranscriptSegment } from "../../api";

type Call = { url: string; method: string; body: unknown };
let calls: Call[] = [];
let draftReply: unknown = { note: {}, markdown: "# Chị Kate\n\n## Quyết định\n| D1 | Chốt UI | ▶ 03:14 |\n", dropped: [] };

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

beforeEach(() => {
  calls = [];
  draftReply = { note: {}, markdown: "# Chị Kate\n\n## Quyết định\n| D1 | Chốt UI | ▶ 03:14 |\n", dropped: [] };
  try {
    localStorage.clear();
  } catch {
    /* storage unavailable */
  }
  vi.stubGlobal("fetch", async (input: RequestInfo, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ url, method, body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined });
    if (url.endsWith("/api/projects")) {
      return Response.json({ projects: [{ id: "mantu", name: "Mantu", cwd: "C:/vault" }, { id: "pim", name: "PIM", cwd: "C:/vault" }] });
    }
    if (url.endsWith("/api/workspaces")) {
      return Response.json({
        workspaces: [
          { id: "abcv2", projectId: "mantu", label: "ABCV2", cwd: "C:/dev/mantu/ABCV2", archivedAt: null },
          { id: "old", projectId: "mantu", label: "Old", cwd: "C:/x", archivedAt: "2026-01-01" },
        ],
      });
    }
    if (url.endsWith("/files") && method === "PUT") return Response.json({ written: ["C:/vault/x.md"] }, { status: 201 });
    if (url.endsWith("/note/draft")) return Response.json(draftReply);
    return new Response("{}", { status: 404 });
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderPanel(): void {
  render(<MeetingSave meeting={MEETING} segments={SEGMENTS} currentMs={() => 1040000} />);
}

const puts = (): Call[] => calls.filter((c) => c.method === "PUT");
const drafts = (): Call[] => calls.filter((c) => c.url.endsWith("/note/draft"));

async function fillAndChoose(value = "mantu::abcv2"): Promise<void> {
  const picker = await screen.findByLabelText("Project or workspace");
  await waitFor(() => expect(picker.querySelectorAll("option").length).toBeGreaterThan(1));
  fireEvent.change(picker, { target: { value } });
  fireEvent.change(screen.getByLabelText("Client"), { target: { value: "Chị Kate" } });
}

describe("AC-8 — the picker lists registered projects/workspaces; the repo copy is off by default", () => {
  it("offers Mantu, Mantu · ABCV2 and PIM (no archived workspace); Save transcript sends alsoRepo:false", async () => {
    renderPanel();
    await fillAndChoose();

    const labels = Array.from((screen.getByLabelText("Project or workspace") as HTMLSelectElement).options).map((o) => o.textContent);
    expect(labels).toEqual(["No project", "Mantu", "Mantu · ABCV2", "PIM"]);
    expect((screen.getByLabelText("Also save to repo") as HTMLInputElement).checked).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: /save transcript/i }));
    await screen.findByTestId("save-message");
    expect(puts()).toHaveLength(1);
    const body = puts()[0].body as Record<string, unknown>;
    expect(body.alsoRepo).toBe(false);
    expect(body.projectId).toBe("mantu");
    expect(body.workspaceId).toBe("abcv2");
    expect(body.slug).toBe("chi-kate");
    expect((body.files as Array<{ name: string; markdown: string }>)[0].markdown).toContain("[00:00:44] Them: Còn cái này");
  });
});

describe("AC-9 — Save sends exactly what the editor holds, and nothing before Save", () => {
  it("an edited line reaches the PUT; drafting alone sends no PUT", async () => {
    renderPanel();
    await fillAndChoose();
    fireEvent.click(screen.getByRole("button", { name: /draft note/i }));
    const editor = (await screen.findByLabelText("Note draft")) as HTMLTextAreaElement;
    expect(puts()).toHaveLength(0);

    const edited = editor.value.replace("Chốt UI", "Chốt UI — Tùng làm màn hình");
    fireEvent.change(editor, { target: { value: edited } });
    expect(puts()).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: /save note/i }));
    await screen.findByTestId("save-message");
    expect(puts()).toHaveLength(1);
    const files = (puts()[0].body as { files: Array<{ name: string; markdown: string }> }).files;
    expect(files).toEqual([{ name: "note.md", markdown: edited }]);
  });
});

describe("AC-10 — a dropped item is shown beside the editor, not inside it", () => {
  it("lists the dropped text under 'không có trong bản ghi' and keeps it out of the markdown", async () => {
    draftReply = {
      note: {},
      markdown: "# Chị Kate\n\n## Quyết định\n| D1 | A | ▶ 00:05 |\n",
      dropped: [{ section: "decisions", text: "Globex ký hợp đồng", atMs: 15000, reason: "outside-segments" }],
    };
    renderPanel();
    await fillAndChoose();
    fireEvent.click(screen.getByRole("button", { name: /draft note/i }));

    const dropped = await screen.findByTestId("note-dropped");
    expect(dropped.textContent).toContain("Globex ký hợp đồng");
    expect(screen.getByText(/không có trong bản ghi/i)).toBeTruthy();
    expect((screen.getByLabelText("Note draft") as HTMLTextAreaElement).value).not.toContain("Globex");
  });
});

describe("AC-11 — defaults: Vietnamese, internal parts excluded, no parts", () => {
  it("an untouched form drafts with language vi, includeInternal false and no parts", async () => {
    renderPanel();
    await fillAndChoose();
    fireEvent.click(screen.getByRole("button", { name: /draft note/i }));
    await screen.findByLabelText("Note draft");

    expect(drafts()).toHaveLength(1);
    const body = drafts()[0].body as Record<string, unknown>;
    expect(body.language).toBe("vi");
    expect(body.includeInternal).toBe(false);
    expect("parts" in body).toBe(false);
    expect(body.client).toBe("Chị Kate");
  });
});

describe("AC-12 — the glossary is remembered per project", () => {
  it("pre-fills for another meeting in the same project, and is empty for a different one", async () => {
    renderPanel();
    await fillAndChoose("mantu::abcv2");
    fireEvent.change(screen.getByLabelText("Glossary"), { target: { value: "comparency, confessency → competency" } });
    fireEvent.click(screen.getByRole("button", { name: /draft note/i }));
    await screen.findByLabelText("Note draft");
    expect((drafts()[0].body as { glossary: unknown }).glossary).toEqual([
      { heard: ["comparency", "confessency"], term: "competency" },
    ]);
    cleanup();

    // Another meeting, same project: the row is pre-filled.
    renderPanel();
    await fillAndChoose("mantu::");
    await waitFor(() =>
      expect((screen.getByLabelText("Glossary") as HTMLTextAreaElement).value).toBe("comparency, confessency → competency"),
    );
    cleanup();

    // A different project: empty.
    renderPanel();
    await fillAndChoose("pim::");
    await waitFor(() => expect((screen.getByLabelText("Glossary") as HTMLTextAreaElement).value).toBe(""));
  });
});
