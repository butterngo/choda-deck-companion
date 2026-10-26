// TASK-2760 — streamed replies, markdown, copy and Stop. The reply body is a
// ReadableStream the test feeds by hand, so "visible before done" is checked
// while `done` has genuinely not been sent yet.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { AssistantView } from "../AssistantView";

type Feed = {
  push: (event: string, data: unknown) => void;
  close: () => void;
  signal: AbortSignal | null;
};

let feed: Feed | null = null;
let messageReply: (init?: RequestInit) => Response;
let writeText: ReturnType<typeof vi.fn>;

const CHAT = {
  id: "CHAT-1",
  title: "Status",
  model: null,
  tokensUsed: 0,
  tokenBudget: 300000,
  updatedAt: "2026-10-26T10:00:00Z",
};

function streamReply(init?: RequestInit): Response {
  const enc = new TextEncoder();
  let ctrl!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      ctrl = c;
    },
  });
  const signal = (init?.signal as AbortSignal | undefined) ?? null;
  signal?.addEventListener("abort", () => {
    try {
      ctrl.error(new DOMException("aborted", "AbortError"));
    } catch {
      /* already closed */
    }
  });
  feed = {
    push: (event, data) => ctrl.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)),
    close: () => ctrl.close(),
    signal,
  };
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream; charset=utf-8" } });
}

const DONE = (over: Record<string, unknown> = {}) => ({
  reply: { content: "Hello" },
  steps: [],
  capped: false,
  usage: { prompt: 10, completion: 5, estimated: false },
  chat: { tokensUsed: 15, tokenBudget: 300000 },
  ...over,
});

beforeEach(() => {
  feed = null;
  messageReply = streamReply;
  writeText = vi.fn(async () => undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  vi.stubGlobal("fetch", async (input: RequestInfo, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url.endsWith("/assistant/models")) return Response.json({ models: [{ id: "gpt-5.6-luna", model: "gpt-5.6-luna" }], selected: "gpt-5.6-luna" });
    if (url.endsWith("/assistant/chats") && method === "GET") return Response.json([CHAT]);
    if (/\/assistant\/chats\/CHAT-1$/.test(url)) return Response.json({ chat: CHAT, messages: [] });
    if (url.endsWith("/messages") && method === "POST") return messageReply(init);
    return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function ask(text = "hi"): Promise<void> {
  render(<AssistantView />);
  fireEvent.click(await screen.findByRole("button", { name: /Status/ }));
  await screen.findByText("Ask your first question");
  fireEvent.change(screen.getByLabelText("Message"), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => expect(feed).not.toBeNull());
}

describe("streaming", () => {
  it('AC-1: shows "Hel" before done is delivered, and "Hello" after', async () => {
    await ask();
    feed?.push("delta", { text: "Hel" });
    await waitFor(() => expect(screen.getByTestId("assistant-live").textContent).toContain("Hel"));
    expect(screen.queryByTestId("assistant-reply")).toBeNull();
    feed?.push("delta", { text: "lo" });
    feed?.push("done", DONE());
    feed?.close();
    await waitFor(() => expect(screen.getByTestId("assistant-reply").textContent).toContain("Hello"));
  });

  it("AC-2: Stop aborts the request's signal and re-enables the input", async () => {
    await ask();
    feed?.push("delta", { text: "Part" });
    fireEvent.click(await screen.findByRole("button", { name: "Stop" }));
    await waitFor(() => expect(feed?.signal?.aborted).toBe(true));
    await waitFor(() => expect((screen.getByLabelText("Message") as HTMLTextAreaElement).disabled).toBe(false));
  });

  it("Enter sends the message; Shift+Enter and an IME-composing Enter do not", async () => {
    render(<AssistantView />);
    fireEvent.click(await screen.findByRole("button", { name: /Status/ }));
    await screen.findByText("Ask your first question");
    const box = screen.getByLabelText("Message");
    fireEvent.change(box, { target: { value: "hi" } });
    fireEvent.keyDown(box, { key: "Enter", shiftKey: true });
    fireEvent.keyDown(box, { key: "Enter", isComposing: true });
    expect(feed).toBeNull();
    fireEvent.keyDown(box, { key: "Enter" });
    await waitFor(() => expect(feed).not.toBeNull());
  });

  it("AC-3: a step event shows a get_task chip before done", async () => {
    await ask();
    feed?.push("step", { tool: "get_task", ok: true, chars: 40 });
    const chip = await screen.findByTestId("assistant-tool-chip");
    expect(chip.textContent).toContain("get_task");
    expect(chip.querySelector('[aria-label="ok"]')).not.toBeNull();
    expect(screen.queryByTestId("assistant-reply")).toBeNull();
  });

  it("AC-4: a failed step shows the failed mark, not the ok mark", async () => {
    await ask();
    feed?.push("step", { tool: "get_task", ok: false, chars: 30 });
    const chip = await screen.findByTestId("assistant-tool-chip");
    expect(chip.querySelector('[aria-label="failed"]')).not.toBeNull();
    expect(chip.querySelector('[aria-label="ok"]')).toBeNull();
  });

  it('AC-5: "Writing… · 2 steps so far" shows after two steps and is gone after done', async () => {
    await ask();
    feed?.push("step", { tool: "search", ok: true, chars: 10 });
    feed?.push("step", { tool: "get_task", ok: true, chars: 20 });
    expect(await screen.findByText("Writing… · 2 steps so far")).toBeTruthy();
    feed?.push("done", DONE({ steps: [{ tool: "search", ok: true, chars: 10 }, { tool: "get_task", ok: true, chars: 20 }] }));
    feed?.close();
    await waitFor(() => expect(screen.queryByText(/so far/)).toBeNull());
  });
});

describe("markdown", () => {
  it("AC-6: a GFM pipe table renders a <table>", async () => {
    await ask();
    feed?.push("done", DONE({ reply: { content: "| Task | Status |\n|---|---|\n| TASK-1 | READY |" } }));
    feed?.close();
    await waitFor(() => expect(screen.getByTestId("assistant-reply").querySelector("table")).not.toBeNull());
  });

  it("AC-7: a fenced ts block renders <pre><code> and Copy writes exactly the code", async () => {
    const code = "export const x = 1\nconsole.log(x)";
    await ask();
    feed?.push("done", DONE({ reply: { content: `Here:\n\n\`\`\`ts\n${code}\n\`\`\`\n` } }));
    feed?.close();
    const reply = await screen.findByTestId("assistant-reply");
    expect(reply.querySelector("pre code")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(code));
  });

  it("AC-8: after Copy the button reads Copied", async () => {
    await ask();
    feed?.push("done", DONE({ reply: { content: "```ts\nconst a = 1\n```" } }));
    feed?.close();
    fireEvent.click(await screen.findByRole("button", { name: "Copy" }));
    expect(await screen.findByRole("button", { name: "Copied" })).toBeTruthy();
  });

  it("AC-9: Copy reply writes the reply's markdown source, fences included", async () => {
    const md = "Use this:\n\n```ts\nconst a = 1\n```";
    await ask();
    feed?.push("done", DONE({ reply: { content: md } }));
    feed?.close();
    fireEvent.click(await screen.findByRole("button", { name: "Copy reply" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(md));
  });

  it("AC-10: a user message with **bold** shows the literal asterisks", async () => {
    await ask("make this **bold** please");
    const user = await screen.findByTestId("assistant-user-turn");
    expect(user.textContent).toBe("make this **bold** please");
    expect(user.querySelector("strong")).toBeNull();
  });
});

describe("cost and errors", () => {
  it("AC-11: done with 2 steps and usage 184 + 50 renders 2 steps · 234 tokens", async () => {
    await ask();
    feed?.push(
      "done",
      DONE({
        steps: [{ tool: "search", ok: true, chars: 1 }, { tool: "get_task", ok: true, chars: 1 }],
        usage: { prompt: 184, completion: 50, estimated: false },
      }),
    );
    feed?.close();
    expect(await screen.findByText("2 steps · 234 tokens")).toBeTruthy();
  });

  it("AC-12: a 503 renders the service-not-running message", async () => {
    messageReply = () => Response.json({ error: "assistant service unavailable" }, { status: 503 });
    render(<AssistantView />);
    fireEvent.click(await screen.findByRole("button", { name: /Status/ }));
    await screen.findByText("Ask your first question");
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "what is on today?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("The assistant service is not running — restart the companion")).toBeTruthy();
  });

  it("AC-13: after that 503 the input still holds the question", async () => {
    messageReply = () => Response.json({ error: "assistant service unavailable" }, { status: 503 });
    render(<AssistantView />);
    fireEvent.click(await screen.findByRole("button", { name: /Status/ }));
    await screen.findByText("Ask your first question");
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "what is on today?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByRole("alert");
    expect((screen.getByLabelText("Message") as HTMLTextAreaElement).value).toBe("what is on today?");
  });

  it("AC-14: a 409 budget exhausted disables the input and offers New chat from this one", async () => {
    messageReply = () => Response.json({ error: "budget exhausted", tokensUsed: 300000, tokenBudget: 300000 }, { status: 409 });
    render(<AssistantView />);
    fireEvent.click(await screen.findByRole("button", { name: /Status/ }));
    await screen.findByText("Ask your first question");
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "one more" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByRole("button", { name: /New chat from this one/ })).toBeTruthy();
    expect((screen.getByLabelText("Message") as HTMLTextAreaElement).disabled).toBe(true);
  });
});
