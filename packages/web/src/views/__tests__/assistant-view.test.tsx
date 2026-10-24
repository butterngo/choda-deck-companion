// TASK-2736 — the Assistant screen. fetch is a recorder, so what was sent — and
// above all which POST /messages was NOT sent — is counted.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { AssistantView } from "../AssistantView";

type Call = { url: string; method: string; body: unknown };
let calls: Call[] = [];
let chats: unknown[] = [];
let modelsReply: Response | null = null;
let messageReply: () => Response = () => new Response("{}", { status: 500 });

const CHAT = (over: Record<string, unknown> = {}) => ({
  id: "CHAT-1",
  title: "Status",
  model: null,
  tokensUsed: 0,
  tokenBudget: 300000,
  updatedAt: "2026-10-24T10:00:00Z",
  ...over,
});

beforeEach(() => {
  calls = [];
  chats = [CHAT()];
  modelsReply = null;
  messageReply = () =>
    Response.json({
      reply: { content: "TASK-1 is READY." },
      steps: [
        { tool: "search", ok: true, chars: 10 },
        { tool: "get_task", ok: true, chars: 20 },
        { tool: "get_runs", ok: true, chars: 30 },
      ],
      capped: false,
      usage: { prompt: 168, completion: 19, estimated: false },
      chat: { tokensUsed: 187, tokenBudget: 300000 },
    });
  vi.stubGlobal("fetch", async (input: RequestInfo, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ url, method, body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined });
    if (url.endsWith("/assistant/models")) {
      return (
        modelsReply ??
        Response.json({
          models: [
            { id: "gpt-4.1-mini", model: "gpt-4.1-mini" },
            { id: "gpt-5.6-luna", model: "gpt-5.6-luna" },
          ],
          selected: "gpt-5.6-luna",
        })
      );
    }
    if (url.endsWith("/assistant/chats") && method === "GET") return Response.json(chats);
    if (/\/assistant\/chats\/CHAT-1$/.test(url)) {
      return Response.json({ chat: chats[0], messages: [] });
    }
    if (url.endsWith("/messages") && method === "POST") return messageReply();
    return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const posts = (): Call[] => calls.filter((c) => c.method === "POST" && c.url.endsWith("/messages"));

async function openChat(): Promise<void> {
  render(<AssistantView />);
  fireEvent.click(await screen.findByRole("button", { name: /Status/ }));
  await waitFor(() => expect(calls.some((c) => /\/assistant\/chats\/CHAT-1$/.test(c.url))).toBe(true));
}

describe("model picker", () => {
  it("preselects the model named in `selected`, not the first one listed", async () => {
    render(<AssistantView />);
    const picker = (await screen.findByLabelText("Model")) as HTMLSelectElement;
    await waitFor(() => expect(picker.value).toBe("gpt-5.6-luna"));
    expect(picker.options[0].value).toBe("gpt-4.1-mini");
  });

  it("opening the view and changing the model sends no message", async () => {
    render(<AssistantView />);
    const picker = (await screen.findByLabelText("Model")) as HTMLSelectElement;
    await waitFor(() => expect(picker.options.length).toBe(2));
    fireEvent.change(picker, { target: { value: "gpt-4.1-mini" } });
    await new Promise((r) => setTimeout(r, 20));
    expect(posts()).toHaveLength(0);
  });
});

describe("replies", () => {
  it("renders `3 steps · 187 tokens` under a reply with 3 steps and usage 168 + 19", async () => {
    await openChat();
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "what is TASK-1?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("3 steps · 187 tokens")).toBeTruthy();
    expect(posts()).toHaveLength(1);
  });
});

describe("budget", () => {
  it("shows the warning at 250000 / 300000 tokens", async () => {
    chats = [CHAT({ tokensUsed: 250000 })];
    await openChat();
    expect(await screen.findByTestId("assistant-budget-warning")).toBeTruthy();
  });

  it("shows no warning at 100000 / 300000 tokens", async () => {
    chats = [CHAT({ tokensUsed: 100000 })];
    await openChat();
    expect(screen.queryByTestId("assistant-budget-warning")).toBeNull();
  });

  it("a 409 budget exhausted disables the input and offers 'New chat from this one'", async () => {
    messageReply = () =>
      Response.json({ error: "budget exhausted", tokensUsed: 300000, tokenBudget: 300000 }, { status: 409 });
    await openChat();
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "one more" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByRole("button", { name: /New chat from this one/ })).toBeTruthy();
    expect((screen.getByLabelText("Message") as HTMLTextAreaElement).disabled).toBe(true);
  });
});

describe("an adapter that predates the routes", () => {
  it("renders the 'adapter is older than this app' message on a router-default 404", async () => {
    modelsReply = new Response(JSON.stringify({ error: "not found" }), { status: 404 });
    render(<AssistantView />);
    expect(await screen.findByText(/adapter is older than this app/)).toBeTruthy();
  });
});
