// TASK-2047 — saying where a note will be saved, before the Save button is pressed.
//
// The criterion that carries the weight is that the preview tracks the PICKER.
// A panel that printed one correct-looking path and never changed it would pass
// any single-case test, so every assertion here is paired with a change: pick a
// different project, tick the repo copy, type a different client — and read the
// rendered path back each time.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { MeetingSave, saveDestinations, slugify } from "../MeetingSave";
import type { MeetingMeta, TranscriptSegment } from "../../api";

const MEETING: MeetingMeta = {
  id: "m1",
  // Deliberately late in the day UTC: localDate must decide the folder's date,
  // and a test that used the ISO prefix would disagree with the app in some zones.
  startedAt: "2026-09-17T07:37:25.846Z",
  endedAt: "2026-09-17T08:02:57.151Z",
  tracks: ["mic", "loopback"],
  bytes: 49542308,
  transcribedAt: "2026-09-17T10:21:27.580Z",
};

const SEGMENTS: TranscriptSegment[] = [
  { track: "loopback", speaker: "Them", startMs: 44000, endMs: 50000, text: "Còn cái này", locale: "vi-VN" },
];

let writes: Array<{ url: string; method: string; body: unknown }> = [];
let filesReply: { status: number; body: unknown } = {
  status: 201,
  body: { written: ["C:/Users/x/vault/10-Projects/mantu/meetings/2026-09-17-chi-kate/note.md"] },
};
let copiedText: string | null = null;

beforeEach(() => {
  writes = [];
  copiedText = null;
  filesReply = {
    status: 201,
    body: { written: ["C:/Users/x/vault/10-Projects/mantu/meetings/2026-09-17-chi-kate/note.md"] },
  };
  try {
    localStorage.clear();
  } catch {
    /* storage unavailable */
  }
  vi.stubGlobal("navigator", {
    ...navigator,
    clipboard: {
      writeText: async (t: string) => {
        copiedText = t;
      },
    },
  });
  vi.stubGlobal("fetch", async (input: RequestInfo, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (method !== "GET") {
      writes.push({ url, method, body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined });
    }
    if (url.endsWith("/api/projects")) {
      return Response.json({
        projects: [
          { id: "mantu", name: "Mantu", cwd: "C:/vault" },
          { id: "juvenis-maxime", name: "JuvenisMaxime", cwd: "C:/dev/test/NewJuvenisMaxime" },
        ],
      });
    }
    if (url.endsWith("/api/workspaces")) {
      return Response.json({
        workspaces: [
          { id: "abcv2", projectId: "mantu", label: "ABCV2", cwd: "C:/dev/mantu/ABCV2", archivedAt: null },
        ],
      });
    }
    if (url.endsWith("/files") && method === "PUT") {
      return new Response(JSON.stringify(filesReply.body), {
        status: filesReply.status,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.endsWith("/note/draft")) {
      return Response.json({ note: {}, markdown: "# note\n", dropped: [] });
    }
    return new Response("{}", { status: 404 });
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function panel(): Promise<HTMLSelectElement> {
  render(<MeetingSave meeting={MEETING} segments={SEGMENTS} currentMs={() => 0} />);
  const picker = (await screen.findByLabelText("Project or workspace")) as HTMLSelectElement;
  await waitFor(() => expect(picker.querySelectorAll("option").length).toBeGreaterThan(1));
  return picker;
}

function vaultPath(): string {
  return screen.getByTestId("destination-vault").textContent ?? "";
}

describe("saveDestinations", () => {
  it("mirrors the adapter's vault rule, relative to the vault root", () => {
    expect(
      saveDestinations({
        projectId: "juvenis-maxime",
        date: "2026-09-17",
        slug: "chi-kate",
        alsoRepo: false,
        workspaceCwd: null,
      }),
    ).toEqual([{ kind: "vault", path: "vault/10-Projects/juvenis-maxime/meetings/2026-09-17-chi-kate" }]);
  });

  it("uses the adapter's own _meetings fallback when there is no project", () => {
    const [d] = saveDestinations({
      projectId: null,
      date: "2026-09-17",
      slug: "chi-kate",
      alsoRepo: false,
      workspaceCwd: null,
    });
    expect(d.path).toBe("vault/10-Projects/_meetings/meetings/2026-09-17-chi-kate");
  });

  it("adds the repo copy as an ABSOLUTE path, because that root is known", () => {
    const out = saveDestinations({
      projectId: "mantu",
      date: "2026-09-17",
      slug: "chi-kate",
      alsoRepo: true,
      workspaceCwd: "C:/dev/mantu/ABCV2",
    });
    expect(out).toHaveLength(2);
    expect(out[1]).toEqual({ kind: "repo", path: "C:/dev/mantu/ABCV2/docs/meetings/2026-09-17-chi-kate" });
  });

  it("omits the repo copy when no workspace is known, rather than printing a null root", () => {
    const out = saveDestinations({
      projectId: "mantu",
      date: "2026-09-17",
      slug: "x",
      alsoRepo: true,
      workspaceCwd: null,
    });
    expect(out).toHaveLength(1);
    expect(JSON.stringify(out)).not.toContain("null");
  });

  it("does not double a separator when the workspace cwd has a trailing one", () => {
    const out = saveDestinations({
      projectId: "mantu",
      date: "2026-09-17",
      slug: "x",
      alsoRepo: true,
      workspaceCwd: "C:/dev/mantu/ABCV2/",
    });
    expect(out[1].path).toBe("C:/dev/mantu/ABCV2/docs/meetings/2026-09-17-x");
  });
});

describe("the destination shown in the panel", () => {
  // AC-1
  it("follows the picker: changing the project changes the path", async () => {
    const picker = await panel();
    fireEvent.change(screen.getByLabelText("Client"), { target: { value: "Chị Kate" } });

    fireEvent.change(picker, { target: { value: "mantu::" } });
    await waitFor(() => expect(vaultPath()).toContain("/mantu/"));
    expect(vaultPath()).not.toContain("juvenis-maxime");

    fireEvent.change(picker, { target: { value: "juvenis-maxime::" } });
    await waitFor(() => expect(vaultPath()).toContain("/juvenis-maxime/"));
    expect(vaultPath()).not.toContain("/mantu/");
  });

  // AC-2
  it("shows the _meetings fallback for No project, not a blank", async () => {
    const picker = await panel();
    fireEvent.change(screen.getByLabelText("Client"), { target: { value: "Chị Kate" } });
    fireEvent.change(picker, { target: { value: "" } });

    await waitFor(() => expect(vaultPath()).toContain("/_meetings/"));
    expect(vaultPath().trim().length).toBeGreaterThan(0);
  });

  // AC-4
  it("shows the slug the save will actually send, diacritics folded", async () => {
    await panel();
    fireEvent.change(screen.getByLabelText("Client"), { target: { value: "Chị Kate" } });

    // The point of the case: the rendered segment is NOT the literal input.
    expect(slugify("Chị Kate")).toBe("chi-kate");
    await waitFor(() => expect(vaultPath()).toContain("chi-kate"));
    expect(vaultPath()).not.toContain("Chị");

    fireEvent.change(screen.getByLabelText("Client"), { target: { value: "Anh Tùng" } });
    await waitFor(() => expect(vaultPath()).toContain("anh-tung"));
    expect(vaultPath()).not.toContain("chi-kate");
  });

  // AC-3
  it("shows the repo copy only while it is ticked", async () => {
    const picker = await panel();
    fireEvent.change(screen.getByLabelText("Client"), { target: { value: "Chị Kate" } });
    fireEvent.change(picker, { target: { value: "mantu::abcv2" } });

    expect(screen.queryByTestId("destination-repo")).toBeNull();

    fireEvent.click(screen.getByLabelText("Also save to repo"));
    await waitFor(() => expect(screen.getByTestId("destination-repo")).toBeInTheDocument());
    expect(screen.getByTestId("destination-repo").textContent).toContain("docs/meetings");

    fireEvent.click(screen.getByLabelText("Also save to repo"));
    await waitFor(() => expect(screen.queryByTestId("destination-repo")).toBeNull());
    // The vault destination is untouched by the toggle.
    expect(screen.getByTestId("destination-vault")).toBeInTheDocument();
  });

  it("names the prediction as a prediction until files exist", async () => {
    await panel();
    expect(screen.getByTestId("destinations").textContent).toContain("Will be saved to");
  });
});

describe("after the save", () => {
  async function saveOnce(): Promise<void> {
    const picker = await panel();
    fireEvent.change(picker, { target: { value: "mantu::" } });
    fireEvent.change(screen.getByLabelText("Client"), { target: { value: "Chị Kate" } });
    fireEvent.click(screen.getByRole("button", { name: /save transcript/i }));
    await screen.findByTestId("save-message");
  }

  // AC-6
  it("replaces the prediction with the real absolute paths the adapter reported", async () => {
    await saveOnce();
    const block = screen.getByTestId("destinations");
    expect(block.textContent).toContain("Saved to");
    expect(block.textContent).toContain("C:/Users/x/vault/10-Projects/mantu/meetings/2026-09-17-chi-kate/note.md");
    // The prediction is gone — two versions of the truth is worse than one.
    expect(block.textContent).not.toContain("Will be saved to");
  });

  // AC-6 — the regression this task exists to fix
  it("keeps the written paths readable after drafting a note again", async () => {
    await saveOnce();
    fireEvent.click(screen.getByRole("button", { name: /draft note/i }));
    await screen.findByLabelText("Note draft");

    // The status line may go; where the files went may not.
    expect(screen.getByTestId("destinations").textContent).toContain(
      "C:/Users/x/vault/10-Projects/mantu/meetings/2026-09-17-chi-kate/note.md",
    );
  });

  it("leaves the prediction in place when the save fails", async () => {
    filesReply = { status: 409, body: { error: "exists" } };
    const picker = await panel();
    fireEvent.change(picker, { target: { value: "mantu::" } });
    fireEvent.change(screen.getByLabelText("Client"), { target: { value: "Chị Kate" } });
    fireEvent.click(screen.getByRole("button", { name: /save transcript/i }));

    await waitFor(() => expect(screen.getByTestId("destinations").textContent).toContain("Will be saved to"));
    expect(screen.getByTestId("destinations").textContent).not.toContain("Saved to");
  });

  // AC-7
  it("copies the full path to the clipboard", async () => {
    await saveOnce();
    const full = "C:/Users/x/vault/10-Projects/mantu/meetings/2026-09-17-chi-kate/note.md";
    fireEvent.click(screen.getByLabelText(`Copy path ${full}`));
    await waitFor(() => expect(copiedText).toBe(full));
    expect(await screen.findByText("Copied")).toBeInTheDocument();
  });

  it("copies the predicted path too, before anything is saved", async () => {
    const picker = await panel();
    fireEvent.change(picker, { target: { value: "mantu::" } });
    fireEvent.change(screen.getByLabelText("Client"), { target: { value: "Chị Kate" } });
    const predicted = vaultPath();

    fireEvent.click(screen.getByLabelText(`Copy path ${predicted}`));
    await waitFor(() => expect(copiedText).toBe(predicted));
    expect(copiedText).toContain("vault/10-Projects/mantu/meetings/");
  });
});
