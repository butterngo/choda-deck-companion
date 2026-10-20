// TASK-2550 — record a decision and sign off as Butter, on the conversation
// pane. fetch is stubbed and every call recorded, so the assertions read the
// requests the adapter would receive.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ConversationDetail as Data } from "../../api";
import { ConversationDetail } from "../ConversationDetail";
import { useConversation } from "../../hooks/use-conversations";

const thread = (over: Partial<Data["conversation"]> = {}, names = ["Butter", "Claude"]): Data => ({
  conversation: {
    id: "CONV-7",
    projectId: "choda-deck",
    title: "Ship or wait",
    status: "open",
    createdBy: "Butter",
    decisionSummary: null,
    signedOff: [],
    createdAt: "2026-10-20T00:00:00.000Z",
    decidedAt: null,
    ...over,
  },
  messages: [],
  participants: names.map((name) => ({ conversationId: "CONV-7", name })),
});

interface Call {
  method: string;
  url: string;
  body: unknown;
}
let calls: Call[] = [];
let reply: (url: string, method: string) => Response = () => json(200, {});

const json = (status: number, b: unknown): Response =>
  new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });

function serve(): void {
  vi.stubGlobal("fetch", async (input: RequestInfo, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ method, url, body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined });
    return reply(url, method);
  });
}

const posts = (suffix: string): Call[] => calls.filter((c) => c.method === "POST" && c.url.endsWith(suffix));

afterEach(() => {
  vi.unstubAllGlobals();
  calls = [];
  reply = () => json(200, {});
});

describe("settling a conversation from the pane", () => {
  it("AC-1: an open thread with Butter and Claude shows Save decision and Sign off as Butter", () => {
    serve();
    render(<ConversationDetail detail={thread()} />);
    expect(screen.getByRole("button", { name: "Save decision" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign off as Butter" })).toBeTruthy();
  });

  it("AC-2: a decided thread shows neither control", () => {
    serve();
    render(<ConversationDetail detail={thread({ status: "decided", decisionSummary: "ship it" })} />);
    expect(screen.queryByRole("button", { name: "Save decision" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Sign off as Butter" })).toBeNull();
  });

  it("AC-3: no Sign off button once Butter has signed", () => {
    serve();
    render(<ConversationDetail detail={thread({ signedOff: ["Butter"] })} />);
    expect(screen.queryByRole("button", { name: "Sign off as Butter" })).toBeNull();
  });

  it("AC-4: no Sign off button when Butter is not a participant", () => {
    serve();
    render(<ConversationDetail detail={thread({}, ["Claude", "Gemini"])} />);
    expect(screen.queryByRole("button", { name: "Sign off as Butter" })).toBeNull();
  });

  it("AC-5: Save decision posts the typed decision once", async () => {
    serve();
    render(<ConversationDetail detail={thread()} />);
    fireEvent.change(screen.getByLabelText("Record decision"), { target: { value: "ship it" } });
    fireEvent.click(screen.getByRole("button", { name: "Save decision" }));
    await waitFor(() => expect(posts("/conversations/CONV-7/decide")).toHaveLength(1));
    expect(posts("/conversations/CONV-7/decide")[0]?.body).toEqual({ decision: "ship it" });
  });

  it("AC-6: Save decision is disabled while the textarea is empty", () => {
    serve();
    render(<ConversationDetail detail={thread()} />);
    expect((screen.getByRole("button", { name: "Save decision" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("AC-7: Sign off as Butter posts {name: Butter} once", async () => {
    serve();
    render(<ConversationDetail detail={thread()} />);
    fireEvent.click(screen.getByRole("button", { name: "Sign off as Butter" }));
    await waitFor(() => expect(posts("/conversations/CONV-7/signoff")).toHaveLength(1));
    expect(posts("/conversations/CONV-7/signoff")[0]?.body).toEqual({ name: "Butter" });
  });

  it("AC-8: a successful signoff re-reads the thread", async () => {
    reply = (url, method) =>
      method === "POST" ? json(200, { conversation: thread().conversation, signedOff: ["Butter"], decided: false }) : json(200, thread());
    serve();
    function Pane(): React.JSX.Element | null {
      const c = useConversation("CONV-7");
      return c.detail ? <ConversationDetail detail={c.detail} onChanged={c.refetch} /> : null;
    }
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <Pane />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Sign off as Butter" }));
    const gets = (): Call[] => calls.filter((c) => c.method === "GET" && c.url.endsWith("/conversations/CONV-7"));
    await waitFor(() => expect(gets()).toHaveLength(2));
  });

  it("AC-9: a refused signoff shows the adapter's error in an alert", async () => {
    reply = () => json(400, { error: "not a participant: Butter" });
    serve();
    render(<ConversationDetail detail={thread()} />);
    fireEvent.click(screen.getByRole("button", { name: "Sign off as Butter" }));
    expect((await screen.findByRole("alert")).textContent).toContain("not a participant: Butter");
  });
});
