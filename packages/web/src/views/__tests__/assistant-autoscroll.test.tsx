// TASK-2811 — the thread follows the conversation to its bottom, unless the
// reader scrolled up. jsdom has no layout, so each test gives the thread a fake
// one: a scrollHeight it controls, a 500 px box, and a scrollTop that stores
// what the view writes. A view that never scrolls leaves scrollTop at 0, and a
// view that always scrolls moves a reader who scrolled up — both fail here.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { AssistantView } from "../AssistantView";

type Feed = { push: (event: string, data: unknown) => void; close: () => void };
let feed: Feed | null = null;

const CHAT = {
  id: "CHAT-1",
  title: "Status",
  model: null,
  tokensUsed: 0,
  tokenBudget: 300000,
  updatedAt: "2026-10-26T10:00:00Z",
};

function streamReply(): Response {
  const enc = new TextEncoder();
  let ctrl!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      ctrl = c;
    },
  });
  feed = {
    push: (event, data) => ctrl.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)),
    close: () => ctrl.close(),
  };
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream; charset=utf-8" } });
}

beforeEach(() => {
  feed = null;
  vi.stubGlobal("fetch", async (input: RequestInfo, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url.endsWith("/assistant/models")) return Response.json({ models: [{ id: "gpt-5.6-luna", model: "gpt-5.6-luna" }], selected: "gpt-5.6-luna" });
    if (url.endsWith("/assistant/chats") && method === "GET") return Response.json([CHAT]);
    if (/\/assistant\/chats\/CHAT-1$/.test(url)) return Response.json({ chat: CHAT, messages: [] });
    if (url.endsWith("/messages") && method === "POST") return streamReply();
    return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const BOX = 500;

/** A fake layout on the thread: `height` is the content height the test sets. */
function fakeLayout(el: HTMLElement): { height: number; top: () => number; scrollTo: (top: number) => void } {
  const layout = { height: BOX, scrollTop: 0 };
  Object.defineProperty(el, "clientHeight", { configurable: true, get: () => BOX });
  Object.defineProperty(el, "scrollHeight", { configurable: true, get: () => layout.height });
  Object.defineProperty(el, "scrollTop", {
    configurable: true,
    get: () => layout.scrollTop,
    set: (v: number) => {
      const next = Math.max(0, Math.min(v, layout.height - BOX));
      if (next === layout.scrollTop) return;
      layout.scrollTop = next;
      // As a browser does: a programmatic scroll also fires a scroll event,
      // asynchronously (TASK-2834 reads it to tell its own moves from the reader's).
      setTimeout(() => fireEvent.scroll(el), 0);
    },
  });
  return {
    get height() {
      return layout.height;
    },
    set height(h: number) {
      layout.height = h;
    },
    top: () => layout.scrollTop,
    /** The reader scrolls: the position moves and a scroll event fires. */
    scrollTo: (top: number) => {
      layout.scrollTop = top;
      fireEvent.scroll(el);
    },
  };
}

async function openChat(): Promise<ReturnType<typeof fakeLayout>> {
  render(<AssistantView />);
  fireEvent.click(await screen.findByRole("button", { name: /Status/ }));
  await screen.findByText("Ask your first question");
  return fakeLayout(screen.getByTestId("assistant-thread"));
}

async function send(text = "hi"): Promise<void> {
  fireEvent.change(screen.getByLabelText("Message"), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => expect(feed).not.toBeNull());
}

describe("the thread follows the conversation (TASK-2811)", () => {
  it("AC-1: sending a question in a thread taller than its box lands at the bottom", async () => {
    const layout = await openChat();
    layout.height = 2000;
    layout.scrollTo(0);
    await send();
    await waitFor(() => expect(layout.top()).toBe(2000 - BOX));
  });

  it("AC-2: while the reply streams at the bottom, a new delta stays at the bottom", async () => {
    const layout = await openChat();
    layout.height = 2000;
    await send();
    await waitFor(() => expect(layout.top()).toBe(1500));

    layout.height = 2600;
    feed?.push("delta", { text: "A longer answer" });
    await waitFor(() => expect(screen.getByTestId("assistant-live").textContent).toContain("A longer answer"));
    await waitFor(() => expect(layout.top()).toBe(2600 - BOX));
  });

  it("AC-3: a reader scrolled up by more than 80 px is not moved by a new delta", async () => {
    const layout = await openChat();
    layout.height = 2000;
    await send();
    await waitFor(() => expect(layout.top()).toBe(1500));

    layout.scrollTo(300); // 1200 px above the bottom
    layout.height = 3000;
    feed?.push("delta", { text: "More text while reading" });
    await waitFor(() => expect(screen.getByTestId("assistant-live").textContent).toContain("More text while reading"));
    expect(layout.top()).toBe(300);
  });

  it("AC-4: scrolling back to within 80 px of the bottom makes the next delta follow again", async () => {
    const layout = await openChat();
    layout.height = 2000;
    await send();
    await waitFor(() => expect(layout.top()).toBe(1500));

    layout.scrollTo(300);
    feed?.push("delta", { text: "one" });
    await waitFor(() => expect(screen.getByTestId("assistant-live").textContent).toContain("one"));
    expect(layout.top()).toBe(300);

    layout.scrollTo(2000 - BOX - 50); // 50 px from the bottom
    layout.height = 2400;
    feed?.push("delta", { text: " two" });
    await waitFor(() => expect(screen.getByTestId("assistant-live").textContent).toContain("one two"));
    await waitFor(() => expect(layout.top()).toBe(2400 - BOX));
  });
});

describe("the follow glides instead of jumping (TASK-2834)", () => {
  /** Let the async scroll events of programmatic moves land. */
  const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 20));

  it("AC-1: the thread scrolls smoothly, unless the reader asked for reduced motion", async () => {
    await openChat();
    const cls = screen.getByTestId("assistant-thread").className.split(/\s+/);
    expect(cls).toContain("scroll-smooth");
    expect(cls).toContain("motion-reduce:scroll-auto");
  });

  it("AC-2: a downward move far from the bottom while following (a smooth scroll in flight) keeps following", async () => {
    const layout = await openChat();
    layout.height = 2000;
    await send();
    await waitFor(() => expect(layout.top()).toBe(1500));
    await settle();

    // A big chunk lands; mid-animation the thread is at 1800 of a 3500 bottom.
    layout.height = 4000;
    layout.scrollTo(1800); // moved down from 1500, 1700 px from the bottom
    feed?.push("delta", { text: "big chunk" });
    await waitFor(() => expect(screen.getByTestId("assistant-live").textContent).toContain("big chunk"));
    await waitFor(() => expect(layout.top()).toBe(4000 - BOX));
  });

  it("AC-3: an upward move to more than 80 px from the bottom while following stops following", async () => {
    const layout = await openChat();
    layout.height = 2000;
    await send();
    await waitFor(() => expect(layout.top()).toBe(1500));
    await settle();

    layout.scrollTo(1200); // moved up, 300 px from the bottom
    layout.height = 2600;
    feed?.push("delta", { text: "while reading" });
    await waitFor(() => expect(screen.getByTestId("assistant-live").textContent).toContain("while reading"));
    await settle();
    expect(layout.top()).toBe(1200);
  });
});
