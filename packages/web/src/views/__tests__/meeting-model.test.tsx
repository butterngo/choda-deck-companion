// TASK-2004 — picking which model drafts the note, in the form.
//
// AC-5's control is the important half: with nothing picked the draft body must
// carry NO `model` field at all. A form that always sends one — even the
// configured default's name — moves the fallback decision from the adapter to
// the browser, and a stale remembered name would then outlive a config change.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { MeetingSave } from "../MeetingSave";
import type { MeetingMeta, TranscriptSegment } from "../../api";

type Call = { url: string; body: unknown };
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
  { track: "loopback", speaker: "Them", startMs: 44000, endMs: 50000, text: "Còn cái này", locale: "vi-VN" },
];

beforeEach(() => {
  calls = [];
  try {
    localStorage.clear();
  } catch {
    /* storage unavailable */
  }
  vi.stubGlobal("fetch", async (input: RequestInfo, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined });
    if (url.endsWith("/claude-config/models")) {
      return Response.json({
        models: [
          { id: "gpt-4.1-mini", model: "gpt-4.1-mini" },
          { id: "gpt-4o", model: "gpt-4o" },
        ],
        selected: "gpt-4.1-mini",
      });
    }
    if (url.endsWith("/api/projects")) {
      return Response.json({
        projects: [
          { id: "mantu", name: "Mantu", cwd: "C:/v" },
          { id: "pim", name: "PIM", cwd: "C:/v" },
        ],
      });
    }
    if (url.endsWith("/api/workspaces")) return Response.json({ workspaces: [] });
    if (url.endsWith("/note/draft")) {
      return Response.json({ markdown: "# draft\n", dropped: [], note: { actions: [] }, usedModel: "gpt-4o" });
    }
    return new Response("{}", { status: 404 });
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const drafts = (): Call[] => calls.filter((c) => c.url.endsWith("/note/draft"));

async function renderPanel(): Promise<void> {
  render(<MeetingSave meeting={MEETING} segments={SEGMENTS} currentMs={() => 0} />);
  const picker = await screen.findByLabelText("Project or workspace");
  await waitFor(() => expect(picker.querySelectorAll("option").length).toBeGreaterThan(1));
}

async function choose(projectValue: string): Promise<void> {
  fireEvent.change(screen.getByLabelText("Project or workspace"), { target: { value: projectValue } });
  fireEvent.change(screen.getByLabelText("Client"), { target: { value: "Chị Kate" } });
}

describe("AC-5 — the select lists the deployments and defaults to sending nothing", () => {
  it("offers Configured default plus the catalog; drafting with nothing picked sends no model field", async () => {
    await renderPanel();
    await choose("mantu::");

    const select = (await screen.findByLabelText("Model")) as HTMLSelectElement;
    await waitFor(() => expect(select.options.length).toBe(3));
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual([
      "Configured default",
      "gpt-4.1-mini",
      "gpt-4o",
    ]);
    expect(select.value).toBe("");

    fireEvent.click(screen.getByRole("button", { name: /draft note/i }));
    await waitFor(() => expect(drafts()).toHaveLength(1));
    expect(Object.keys(drafts()[0].body as Record<string, unknown>)).not.toContain("model");
  });
});

describe("AC-6 — the choice is remembered per project, not globally", () => {
  it("pre-selects it for the same project and leaves another project on the default", async () => {
    await renderPanel();
    await choose("mantu::");
    fireEvent.change(await screen.findByLabelText("Model"), { target: { value: "gpt-4o" } });
    fireEvent.click(screen.getByRole("button", { name: /draft note/i }));
    await waitFor(() => expect(drafts()).toHaveLength(1));
    expect((drafts()[0].body as { model?: string }).model).toBe("gpt-4o");

    cleanup();
    calls = [];
    await renderPanel();

    await choose("mantu::");
    await waitFor(() => expect((screen.getByLabelText("Model") as HTMLSelectElement).value).toBe("gpt-4o"));

    // A different project has its own vocabulary and its own choice.
    await choose("pim::");
    await waitFor(() => expect((screen.getByLabelText("Model") as HTMLSelectElement).value).toBe(""));
    fireEvent.click(screen.getByRole("button", { name: /draft note/i }));
    await waitFor(() => expect(drafts()).toHaveLength(1));
    expect(Object.keys(drafts()[0].body as Record<string, unknown>)).not.toContain("model");
  });
});
