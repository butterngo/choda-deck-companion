// TASK-2043 — the title on a meeting row, and renaming it in place.
//
// The discriminating pair is the fallback: a row WITH a title and a row WITHOUT
// one must render differently, and each test asserts its own shape is present and
// the other's is absent. A row that ignored `title` entirely would pass a
// one-sided test and fail these.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { MeetingsView } from "../MeetingsView";
import { RecorderProvider } from "../../hooks/use-recorder";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { MeetingMeta } from "../../api";

function withQuery(ui: React.ReactNode): React.JSX.Element {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <RecorderProvider>{ui}</RecorderProvider>
    </QueryClientProvider>
  );
}

const BASE: MeetingMeta = {
  id: "m-1",
  startedAt: "2026-09-17T08:29:00.000Z",
  endedAt: "2026-09-17T08:54:00.000Z",
  tracks: ["mic", "loopback"],
  bytes: 49 * 1024 * 1024,
  transcribedAt: "2026-09-17T09:00:00.000Z",
};

let meetings: MeetingMeta[] = [];
/** What PATCH /meetings/:id answers. */
let patchReply: { status: number; body: unknown } = { status: 200, body: { id: "m-1", title: "x" } };
let patchCalls: Array<{ url: string; body: unknown }> = [];

beforeEach(() => {
  meetings = [{ ...BASE }];
  patchCalls = [];
  patchReply = { status: 200, body: { id: "m-1", title: "x" } };
  try {
    localStorage.clear();
  } catch {
    /* storage unavailable in this environment */
  }
  vi.stubGlobal("fetch", async (input: RequestInfo, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (method === "PATCH" && /\/api\/meetings\/[^/]+$/.test(url)) {
      patchCalls.push({ url, body: JSON.parse(String(init?.body ?? "{}")) });
      return new Response(JSON.stringify(patchReply.body), {
        status: patchReply.status,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.endsWith("/api/meetings")) {
      return new Response(JSON.stringify(meetings), {
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

async function renderList(): Promise<void> {
  render(withQuery(<MeetingsView />));
  await screen.findByTestId("meetings-list");
}

describe("the row's primary label", () => {
  // AC-3 — the titled branch
  it("leads with the title and keeps the timestamp as secondary text", async () => {
    meetings = [{ ...BASE, title: "Kate — assessment scope" }];
    await renderList();

    expect(screen.getByTestId("meeting-title")).toHaveTextContent("Kate — assessment scope");
    // The timestamp did not vanish — it is what tells two same-named meetings apart.
    expect(screen.getByTestId("meeting-when").textContent).toMatch(/2026|Sep/);
  });

  // AC-3 — the untitled branch, asserted as the ABSENCE of the titled shape
  it("falls back to the timestamp when there is no title at all", async () => {
    meetings = [{ ...BASE }];
    await renderList();

    expect(screen.queryByTestId("meeting-title")).toBeNull();
    expect(screen.getByTestId("meeting-when").textContent).toMatch(/2026|Sep/);
  });

  it("treats an explicit null the same as an absent title", async () => {
    meetings = [{ ...BASE, title: null }];
    await renderList();
    expect(screen.queryByTestId("meeting-title")).toBeNull();
  });
});

describe("renaming a meeting", () => {
  // AC-6
  it("round-trips: edit, save, and the new title comes back on the row", async () => {
    meetings = [{ ...BASE, title: "old name" }];
    patchReply = { status: 200, body: { id: "m-1", title: "Kate — June delivery" } };
    await renderList();

    fireEvent.click(screen.getByTestId("rename-start"));
    fireEvent.change(screen.getByLabelText("Meeting title"), {
      target: { value: "Kate — June delivery" },
    });
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(screen.getByTestId("meeting-title")).toHaveTextContent("Kate — June delivery");
    });
    expect(patchCalls).toHaveLength(1);
    expect(patchCalls[0].body).toEqual({ title: "Kate — June delivery" });
    // The editor closed rather than staying open over the row it just changed.
    expect(screen.queryByTestId("rename-editor")).toBeNull();
  });

  it("seeds the input with the current title, not with an empty box", async () => {
    meetings = [{ ...BASE, title: "current" }];
    await renderList();
    fireEvent.click(screen.getByTestId("rename-start"));
    expect(screen.getByLabelText("Meeting title")).toHaveValue("current");
  });

  it("sends null to clear when the box is emptied", async () => {
    meetings = [{ ...BASE, title: "to be cleared" }];
    patchReply = { status: 200, body: { id: "m-1", title: null } };
    await renderList();

    fireEvent.click(screen.getByTestId("rename-start"));
    fireEvent.change(screen.getByLabelText("Meeting title"), { target: { value: "   " } });
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => expect(patchCalls).toHaveLength(1));
    expect(patchCalls[0].body).toEqual({ title: null });
    await waitFor(() => expect(screen.queryByTestId("meeting-title")).toBeNull());
  });

  it("sends nothing when the title was not actually changed", async () => {
    meetings = [{ ...BASE, title: "unchanged" }];
    await renderList();

    fireEvent.click(screen.getByTestId("rename-start"));
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => expect(screen.queryByTestId("rename-editor")).toBeNull());
    expect(patchCalls).toHaveLength(0);
  });

  it("abandons the edit on Cancel without sending anything", async () => {
    meetings = [{ ...BASE, title: "keep me" }];
    await renderList();

    fireEvent.click(screen.getByTestId("rename-start"));
    fireEvent.change(screen.getByLabelText("Meeting title"), { target: { value: "discarded" } });
    fireEvent.click(screen.getByText("Cancel"));

    expect(patchCalls).toHaveLength(0);
    expect(screen.getByTestId("meeting-title")).toHaveTextContent("keep me");
  });

  it("keeps the row and shows the error when the save fails", async () => {
    meetings = [{ ...BASE, title: "still here" }];
    patchReply = { status: 500, body: { error: "disk full" } };
    await renderList();

    fireEvent.click(screen.getByTestId("rename-start"));
    fireEvent.change(screen.getByLabelText("Meeting title"), { target: { value: "new" } });
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => expect(screen.getByTestId("rename-error")).toHaveTextContent("disk full"));
    // The old title is intact — a failed rename must not look like a successful one.
    expect(screen.getByTestId("meeting-title")).toHaveTextContent("still here");
  });

  // AC-7 — the vendored-adapter case
  it("reports rename as unavailable against an adapter with no PATCH route", async () => {
    meetings = [{ ...BASE, title: "on an old build" }];
    // What an adapter predating the route actually answers: its catch-all 400.
    patchReply = {
      status: 400,
      body: { error: "expected /meetings/<id>/chunk or /meetings/<id>/finalize" },
    };
    await renderList();

    fireEvent.click(screen.getByTestId("rename-start"));
    fireEvent.change(screen.getByLabelText("Meeting title"), { target: { value: "new" } });
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => expect(screen.getByTestId("rename-unavailable")).toBeInTheDocument());
    // The rest of the row survived: the list is still there and still shows this
    // meeting under the title it already had.
    expect(screen.getByTestId("meetings-list")).toBeInTheDocument();
    expect(screen.getByTestId("meeting-title")).toHaveTextContent("on an old build");
    // ...and the control that cannot work is gone rather than left to fail again.
    expect(screen.queryByTestId("rename-start")).toBeNull();
  });

  it("does not mistake a real 404 for a stale adapter", async () => {
    meetings = [{ ...BASE, title: "gone meeting" }];
    patchReply = { status: 404, body: { error: "meeting not found" } };
    await renderList();

    fireEvent.click(screen.getByTestId("rename-start"));
    fireEvent.change(screen.getByLabelText("Meeting title"), { target: { value: "new" } });
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => expect(screen.getByTestId("rename-error")).toBeInTheDocument());
    expect(screen.queryByTestId("rename-unavailable")).toBeNull();
  });
});
