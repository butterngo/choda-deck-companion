// TASK-2774 — a ```mermaid fence in a finished Assistant reply is drawn as a
// diagram; while the reply is still streaming it stays a code block and
// mermaid is never asked to render it. The mermaid module is mocked at its
// boundary (as DocDiagrams.test.tsx does), so `renderCalls` counts what
// actually reached mermaid.render.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import type { AssistantChatSummary } from "../../api";

const renderCalls: string[] = [];
let shouldThrow = false;

vi.mock("mermaid", () => ({
  default: {
    initialize: () => {},
    render: async (id: string, code: string) => {
      renderCalls.push(code);
      if (shouldThrow) throw new Error("Parse error on line 1");
      return { svg: `<svg data-id="${id}"><title>diagram</title></svg>` };
    },
  },
}));

const { AssistantView } = await import("../AssistantView");

const SOURCE = "sequenceDiagram\n  Browser->>API: login\n  API->>DB: find user";
const REPLY = `Here it is:\n\n\`\`\`mermaid\n${SOURCE}\n\`\`\`\n`;

const CHAT: AssistantChatSummary = {
  id: "CHAT-1",
  title: "Login",
  model: null,
  tokensUsed: 0,
  tokenBudget: 300000,
  updatedAt: "2026-10-27T10:00:00Z",
};

type Feed = { push: (event: string, data: unknown) => void; close: () => void };
let feed: Feed | null = null;
let writeText: ReturnType<typeof vi.fn>;

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

const DONE = (content: string) => ({
  reply: { content },
  steps: [],
  capped: false,
  usage: { prompt: 10, completion: 5, estimated: false },
  chat: { tokensUsed: 15, tokenBudget: 300000 },
});

beforeEach(() => {
  feed = null;
  renderCalls.length = 0;
  shouldThrow = false;
  writeText = vi.fn(async () => undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
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

async function ask(): Promise<void> {
  render(<AssistantView />);
  fireEvent.click(await screen.findByRole("button", { name: /Login/ }));
  await screen.findByText("Ask your first question");
  fireEvent.change(screen.getByLabelText("Message"), { target: { value: "draw a login" } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => expect(feed).not.toBeNull());
}

async function finish(content = REPLY): Promise<HTMLElement> {
  await ask();
  feed?.push("delta", { text: content });
  feed?.push("done", DONE(content));
  feed?.close();
  return screen.findByTestId("assistant-reply");
}

/** Every <pre><code> whose text holds the fence source. */
const codeBlocksWithSource = (root: HTMLElement): Element[] =>
  [...root.querySelectorAll("pre code")].filter((c) => (c.textContent ?? "").includes("Browser->>API"));

describe("mermaid in Assistant replies", () => {
  it("a finished reply with a mermaid fence renders MermaidBlock and no <pre><code> holding the source", async () => {
    const reply = await finish();
    await waitFor(() =>
      expect(reply.querySelector('[data-testid="mermaid-diagram"], [data-testid="mermaid-pending"]')).not.toBeNull(),
    );
    expect(codeBlocksWithSource(reply)).toHaveLength(0);
  });

  it("the live streaming text with the same fence renders a code block and mermaid.render is not called", async () => {
    await ask();
    feed?.push("delta", { text: REPLY });
    const live = await screen.findByTestId("assistant-live");
    await waitFor(() => expect(codeBlocksWithSource(live)).toHaveLength(1));
    expect(live.querySelector('[data-testid^="mermaid-"]')).toBeNull();
    expect(renderCalls).toHaveLength(0);
  });

  it("a resolved render shows mermaid-diagram inside a bg-white panel", async () => {
    const reply = await finish();
    const diagram = await waitFor(() => {
      const d = reply.querySelector('[data-testid="mermaid-diagram"]');
      expect(d).not.toBeNull();
      return d as HTMLElement;
    });
    expect(diagram.closest(".bg-white")).not.toBeNull();
    expect(renderCalls).toEqual([SOURCE]);
  });

  it("a rejected render shows mermaid-error with the fence source", async () => {
    shouldThrow = true;
    const reply = await finish();
    const error = await waitFor(() => {
      const e = reply.querySelector('[data-testid="mermaid-error"]');
      expect(e).not.toBeNull();
      return e as HTMLElement;
    });
    expect(error.textContent).toContain("Browser->>API: login");
  });

  it("the mermaid block's Copy writes exactly the fence source", async () => {
    const reply = await finish();
    const panel = await waitFor(() => {
      const p = reply.querySelector('[data-testid="assistant-diagram"]');
      expect(p).not.toBeNull();
      return p as HTMLElement;
    });
    const copy = panel.parentElement?.querySelector("button");
    expect(copy?.textContent).toContain("Copy");
    fireEvent.click(copy as HTMLButtonElement);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(SOURCE));
  });

  it("a ts fence in a finished reply still renders the plain CodeBlock with <pre><code>", async () => {
    const reply = await finish("Code:\n\n```ts\nconst add = (a: number, b: number) => a + b;\n```\n");
    await waitFor(() => expect(reply.querySelector("pre code")?.textContent).toContain("const add"));
    expect(reply.querySelector('[data-testid^="mermaid-"]')).toBeNull();
    expect(renderCalls).toHaveLength(0);
  });
});
