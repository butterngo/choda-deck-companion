// TASK-2044 — deleting a whole meeting from its row.
//
// The criterion that carries the most weight is the FIRST click sending nothing.
// A confirm that fires the request anyway is indistinguishable from no confirm at
// all, and this operation is irreversible.

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

function meeting(id: string, title?: string): MeetingMeta {
  return {
    id,
    startedAt: "2026-09-17T08:29:00.000Z",
    endedAt: "2026-09-17T08:54:00.000Z",
    tracks: ["mic", "loopback"],
    bytes: 49 * 1024 * 1024,
    transcribedAt: "2026-09-17T09:00:00.000Z",
    ...(title === undefined ? {} : { title }),
  };
}

let meetings: MeetingMeta[] = [];
let deleteReply: { status: number; body: unknown } = { status: 200, body: { deleted: true } };
/** Every non-GET request the row made, in order. */
let writes: Array<{ method: string; url: string }> = [];

beforeEach(() => {
  meetings = [meeting("m-1", "Kate — assessment scope")];
  writes = [];
  deleteReply = { status: 200, body: { deleted: true } };
  try {
    localStorage.clear();
  } catch {
    /* storage unavailable in this environment */
  }
  vi.stubGlobal("fetch", async (input: RequestInfo, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (method !== "GET") writes.push({ method, url });

    if (method === "DELETE" && /\/api\/meetings\/[^/]+$/.test(url)) {
      return new Response(JSON.stringify(deleteReply.body), {
        status: deleteReply.status,
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

describe("deleting a whole meeting", () => {
  // AC-5 — the criterion the whole control exists for
  it("sends nothing on the first click, only on the confirming one", async () => {
    await renderList();

    fireEvent.click(screen.getByTestId("purge-start"));
    expect(screen.getByTestId("purge-confirm")).toBeInTheDocument();
    // Nothing left the app yet.
    expect(writes).toHaveLength(0);

    fireEvent.click(screen.getByTestId("purge-confirmed"));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0].method).toBe("DELETE");
    expect(writes[0].url).toMatch(/\/api\/meetings\/m-1$/);
  });

  it("names what is being destroyed, not just 'delete'", async () => {
    await renderList();
    fireEvent.click(screen.getByTestId("purge-start"));
    const text = screen.getByTestId("purge-confirm").textContent ?? "";
    expect(text).toMatch(/transcript/i);
    expect(text).toMatch(/cannot be undone/i);
  });

  it("abandons on Cancel and sends nothing", async () => {
    await renderList();
    fireEvent.click(screen.getByTestId("purge-start"));
    fireEvent.click(screen.getByText("Cancel"));

    expect(screen.queryByTestId("purge-confirm")).toBeNull();
    expect(writes).toHaveLength(0);
    expect(screen.getByTestId("meeting-m-1")).toBeInTheDocument();
  });

  // AC-6 — the success half
  it("drops the row without a manual refresh, and leaves the others alone", async () => {
    meetings = [meeting("m-1", "doomed"), meeting("m-2", "keeper")];
    await renderList();

    fireEvent.click(screen.getAllByTestId("purge-start")[0]);
    fireEvent.click(screen.getByTestId("purge-confirmed"));

    await waitFor(() => expect(screen.queryByTestId("meeting-m-1")).toBeNull());
    // The control: the sibling row is untouched.
    expect(screen.getByTestId("meeting-m-2")).toBeInTheDocument();
    expect(screen.getByTestId("meetings-list")).toBeInTheDocument();
  });

  // AC-6 — the failure half
  it("keeps the row and shows the error when the delete fails", async () => {
    deleteReply = { status: 500, body: { error: "file in use" } };
    await renderList();

    fireEvent.click(screen.getByTestId("purge-start"));
    fireEvent.click(screen.getByTestId("purge-confirmed"));

    await waitFor(() => expect(screen.getByTestId("purge-error")).toHaveTextContent("file in use"));
    // A failed delete must not look like a successful one.
    expect(screen.getByTestId("meeting-m-1")).toBeInTheDocument();
  });

  // AC-7
  it("reports delete as unavailable against an adapter with no such route", async () => {
    deleteReply = {
      status: 400,
      body: { error: "expected /meetings/<id>/chunk or /meetings/<id>/finalize" },
    };
    await renderList();

    fireEvent.click(screen.getByTestId("purge-start"));
    fireEvent.click(screen.getByTestId("purge-confirmed"));

    await waitFor(() => expect(screen.getByTestId("purge-unavailable")).toBeInTheDocument());
    // The row survives and the rest of it still works.
    expect(screen.getByTestId("meeting-m-1")).toBeInTheDocument();
    expect(screen.getByTestId("meeting-title")).toHaveTextContent("Kate — assessment scope");
    expect(screen.queryByTestId("purge-start")).toBeNull();
    // ...and rename, a different route, is not tarred with the same brush.
    expect(screen.getByTestId("rename-start")).toBeInTheDocument();
  });

  it("does not confuse a real 404 with a stale adapter", async () => {
    deleteReply = { status: 404, body: { error: "meeting not found" } };
    await renderList();

    fireEvent.click(screen.getByTestId("purge-start"));
    fireEvent.click(screen.getByTestId("purge-confirmed"));

    await waitFor(() => expect(screen.getByTestId("purge-error")).toBeInTheDocument());
    expect(screen.queryByTestId("purge-unavailable")).toBeNull();
  });

  it("does not arm the audio-only delete that lives inside the row", async () => {
    await renderList();
    fireEvent.click(screen.getByTestId("purge-start"));
    // The two confirmations are separate state; opening this one must not put
    // the audio delete into its confirming state.
    expect(screen.queryByTestId("delete-confirm")).toBeNull();
  });
});
