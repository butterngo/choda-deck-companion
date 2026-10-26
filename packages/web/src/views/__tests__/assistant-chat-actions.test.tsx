// TASK-2762 — search, rename and delete chats; regenerate the last reply; edit a
// question and resend. fetch is a recorder, so the requests each control sends
// — and the ones it must not send — are counted.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { AssistantView } from "../AssistantView";

type Call = { url: string; method: string; body: unknown };
let calls: Call[] = [];
let feed: { push: (e: string, d: unknown) => void; close: () => void } | null = null;
let confirmSpy: ReturnType<typeof vi.fn>;

const CHAT = (id: string, title: string) => ({
  id,
  title,
  model: null,
  tokensUsed: 1000,
  tokenBudget: 300000,
  updatedAt: "2026-10-26T10:00:00Z",
});
const CHATS = [CHAT("CHAT-3", "Debounce"), CHAT("CHAT-4", "Ichiba servers"), CHAT("CHAT-5", "Meetings")];

const MSG = (n: number, role: "user" | "assistant", content: string) => ({
  id: `CHAT-3-M${n}`,
  role,
  content,
  toolName: null,
  model: null,
  promptTokens: role === "assistant" ? 100 : null,
  completionTokens: role === "assistant" ? 20 : null,
  tokensEstimated: false,
  createdAt: "2026-10-26T10:00:00Z",
});
const THREAD = [
  MSG(1, "user", "first question"),
  MSG(2, "assistant", "first answer"),
  MSG(3, "user", "second question"),
  MSG(4, "assistant", "second answer"),
];

function stream(): Response {
  const enc = new TextEncoder();
  let ctrl!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start: (c) => void (ctrl = c) });
  feed = {
    push: (e, d) => ctrl.enqueue(enc.encode(`event: ${e}\ndata: ${JSON.stringify(d)}\n\n`)),
    close: () => ctrl.close(),
  };
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

const DONE = (content: string) => ({
  reply: { content },
  steps: [],
  capped: false,
  usage: { prompt: 10, completion: 5, estimated: false },
  chat: { tokensUsed: 1015, tokenBudget: 300000 },
});

beforeEach(() => {
  calls = [];
  feed = null;
  confirmSpy = vi.fn(() => true);
  vi.stubGlobal("confirm", confirmSpy);
  vi.stubGlobal("fetch", async (input: RequestInfo, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ url, method, body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined });
    const path = url.replace(/^.*\/api/, "");
    if (path === "/assistant/models") return Response.json({ models: [{ id: "gpt-5.6-luna", model: "gpt-5.6-luna" }], selected: "gpt-5.6-luna" });
    if (path === "/assistant/chats" && method === "GET") return Response.json(CHATS);
    if (path.startsWith("/assistant/chats?q=")) return Response.json([CHATS[0]]);
    const detail = /^\/assistant\/chats\/(CHAT-\d+)$/.exec(path);
    if (detail && method === "GET") return Response.json({ chat: CHATS.find((c) => c.id === detail[1]), messages: detail[1] === "CHAT-3" ? THREAD : [] });
    if (detail && method === "PATCH") return Response.json({ ...CHATS.find((c) => c.id === detail[1]), title: (JSON.parse(String(init?.body)) as { title: string }).title });
    if (detail && method === "DELETE") return new Response(null, { status: 204 });
    if (method === "POST" && (path.endsWith("/regenerate") || path.endsWith("/edit") || path.endsWith("/messages"))) return stream();
    return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const posts = (suffix: string): Call[] => calls.filter((c) => c.method === "POST" && c.url.endsWith(suffix));

async function openChat3(): Promise<void> {
  render(<AssistantView />);
  fireEvent.click(await screen.findByRole("button", { name: /^Debounce/ }));
  await screen.findByText("second answer");
}

function menuFor(title: RegExp): HTMLElement {
  const row = screen.getByRole("button", { name: title }).parentElement as HTMLElement;
  return within(row).getByRole("button", { name: "Chat actions" });
}

describe("chat list", () => {
  it("AC-1: typing zebra sends one GET ?q=zebra after the debounce and lists only the returned chats", async () => {
    render(<AssistantView />);
    await screen.findByRole("button", { name: /^Meetings/ });
    fireEvent.change(screen.getByLabelText("Search chats"), { target: { value: "z" } });
    fireEvent.change(screen.getByLabelText("Search chats"), { target: { value: "zebra" } });
    await waitFor(() => expect(calls.filter((c) => c.url.includes("?q=")).length).toBe(1), { timeout: 2000 });
    expect(calls.filter((c) => c.url.includes("?q="))[0].url).toMatch(/\/assistant\/chats\?q=zebra$/);
    await waitFor(() => expect(screen.queryByRole("button", { name: /^Meetings/ })).toBeNull());
    expect(screen.getByRole("button", { name: /^Debounce/ })).toBeTruthy();
  });

  it("AC-2: with 3 chats returned it says 3 chats match", async () => {
    render(<AssistantView />);
    await screen.findByRole("button", { name: /^Meetings/ });
    const fetchMock = globalThis.fetch;
    vi.stubGlobal("fetch", async (input: RequestInfo, init?: RequestInit) =>
      String(input).includes("?q=") ? Response.json(CHATS) : fetchMock(input, init),
    );
    fireEvent.change(screen.getByLabelText("Search chats"), { target: { value: "a" } });
    expect(await screen.findByText("3 chats match", undefined, { timeout: 2000 })).toBeTruthy();
  });

  it("AC-3: Rename + Enter sends PATCH with the new title and the row shows it", async () => {
    render(<AssistantView />);
    await screen.findByRole("button", { name: /^Debounce/ });
    fireEvent.click(menuFor(/^Debounce/));
    fireEvent.click(screen.getByRole("menuitem", { name: /Rename/ }));
    const box = screen.getByLabelText("Chat title");
    fireEvent.change(box, { target: { value: "Ichiba servers" } });
    fireEvent.keyDown(box, { key: "Enter" });
    await waitFor(() => expect(calls.some((c) => c.method === "PATCH")).toBe(true));
    const patch = calls.find((c) => c.method === "PATCH") as Call;
    expect(patch.url).toMatch(/\/assistant\/chats\/CHAT-3$/);
    expect(patch.body).toEqual({ title: "Ichiba servers" });
    expect(await screen.findAllByRole("button", { name: /^Ichiba servers/ })).toHaveLength(2);
  });

  it("AC-4: Escape during rename sends nothing and keeps the old title", async () => {
    render(<AssistantView />);
    await screen.findByRole("button", { name: /^Debounce/ });
    fireEvent.click(menuFor(/^Debounce/));
    fireEvent.click(screen.getByRole("menuitem", { name: /Rename/ }));
    const box = screen.getByLabelText("Chat title");
    fireEvent.change(box, { target: { value: "something else" } });
    fireEvent.keyDown(box, { key: "Escape" });
    expect(calls.some((c) => c.method === "PATCH")).toBe(false);
    expect(screen.getByRole("button", { name: /^Debounce/ })).toBeTruthy();
  });

  it("AC-5: Delete asks in the page, never window.confirm, then sends DELETE and drops the row", async () => {
    render(<AssistantView />);
    await screen.findByRole("button", { name: /^Ichiba servers/ });
    fireEvent.click(menuFor(/^Ichiba servers/));
    fireEvent.click(screen.getByRole("menuitem", { name: /Delete/ }));
    const confirmBox = screen.getByRole("group", { name: "Confirm delete" });
    expect(within(confirmBox).getByText('Delete "Ichiba servers"?')).toBeTruthy();
    fireEvent.click(within(confirmBox).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE")).toBe(true));
    expect(calls.find((c) => c.method === "DELETE")?.url).toMatch(/\/assistant\/chats\/CHAT-4$/);
    expect(confirmSpy).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("button", { name: /^Ichiba servers/ })).toBeNull());
  });

  it("AC-6: deleting the open chat empties the thread pane", async () => {
    await openChat3();
    fireEvent.click(menuFor(/^Debounce/));
    fireEvent.click(screen.getByRole("menuitem", { name: /Delete/ }));
    fireEvent.click(within(screen.getByRole("group", { name: "Confirm delete" })).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByText("second answer")).toBeNull());
    expect(screen.getByText("No chat selected")).toBeTruthy();
  });
});

describe("regenerate", () => {
  it("AC-7: Regenerate POSTs /regenerate and the old reply is gone once done arrives", async () => {
    await openChat3();
    fireEvent.click(screen.getByRole("button", { name: /Regenerate/ }));
    await waitFor(() => expect(posts("/regenerate")).toHaveLength(1));
    expect(posts("/regenerate")[0].url).toMatch(/\/assistant\/chats\/CHAT-3\/regenerate$/);
    feed?.push("done", DONE("a fresh answer"));
    feed?.close();
    expect(await screen.findByText("a fresh answer")).toBeTruthy();
    expect(screen.queryByText("second answer")).toBeNull();
  });

  it("AC-8: Regenerate appears only on the last assistant turn", async () => {
    await openChat3();
    const buttons = screen.getAllByRole("button", { name: /Regenerate/ });
    expect(buttons).toHaveLength(1);
    const lastReply = screen.getAllByTestId("assistant-reply").at(-1) as HTMLElement;
    expect(within(lastReply).getByRole("button", { name: /Regenerate/ })).toBe(buttons[0]);
  });
});

describe("edit and resend", () => {
  it("AC-9: Edit shows Save and resend and the warning line", async () => {
    await openChat3();
    fireEvent.click(screen.getAllByRole("button", { name: "Edit question" })[0]);
    expect(screen.getByRole("button", { name: "Save and resend" })).toBeTruthy();
    expect(screen.getByText("Saving replaces the reply below and everything after it")).toBeTruthy();
  });

  it("AC-10: while editing, the later turns are still in the thread", async () => {
    await openChat3();
    fireEvent.click(screen.getAllByRole("button", { name: "Edit question" })[0]);
    expect(screen.getByText("first answer")).toBeTruthy();
    expect(screen.getByText("second question")).toBeTruthy();
    expect(screen.getByText("second answer")).toBeTruthy();
    expect(posts("/edit")).toHaveLength(0);
  });

  it("AC-11: saving POSTs /messages/CHAT-3-M1/edit with the new text and drops the later turns", async () => {
    await openChat3();
    fireEvent.click(screen.getAllByRole("button", { name: "Edit question" })[0]);
    fireEvent.change(screen.getByRole("textbox", { name: "Edit question" }), { target: { value: "first question, edited" } });
    fireEvent.click(screen.getByRole("button", { name: "Save and resend" }));
    await waitFor(() => expect(posts("/edit")).toHaveLength(1));
    expect(posts("/edit")[0].url).toMatch(/\/assistant\/chats\/CHAT-3\/messages\/CHAT-3-M1\/edit$/);
    expect(posts("/edit")[0].body).toEqual({ content: "first question, edited", model: "gpt-5.6-luna" });
    await waitFor(() => expect(screen.queryByText("second answer")).toBeNull());
    expect(screen.queryByText("first answer")).toBeNull();
    expect(screen.queryByText("second question")).toBeNull();
    expect(screen.getByText("first question, edited")).toBeTruthy();
  });
});

describe("while streaming", () => {
  it("AC-12: Rename/Delete menus, Regenerate and Edit are disabled", async () => {
    await openChat3();
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "third question" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(feed).not.toBeNull());
    for (const b of screen.getAllByRole("button", { name: "Chat actions" })) expect((b as HTMLButtonElement).disabled).toBe(true);
    for (const b of screen.getAllByRole("button", { name: "Edit question" })) expect((b as HTMLButtonElement).disabled).toBe(true);
    for (const b of screen.queryAllByRole("button", { name: /Regenerate/ })) expect((b as HTMLButtonElement).disabled).toBe(true);
    feed?.push("done", DONE("third answer"));
    feed?.close();
    await screen.findByText("third answer");
  });
});
