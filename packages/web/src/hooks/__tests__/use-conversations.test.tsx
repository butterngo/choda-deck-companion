// TASK-2556 — the detail pane polls, so a thread settled elsewhere (a signoff
// through MCP) stops offering its controls without a reload.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ConversationDetail as Data } from "../../api";
import { ConversationDetail } from "../../components/ConversationDetail";
import { useConversation } from "../use-conversations";
import { HEALTH_POLL_MS } from "../use-health";

const thread = (status: "open" | "decided"): Data => ({
  conversation: {
    id: "CONV-7",
    projectId: "choda-deck",
    title: "Ship or wait",
    status,
    createdBy: "Butter",
    decisionSummary: status === "decided" ? "ship it" : null,
    signedOff: status === "decided" ? ["Butter", "Claude"] : [],
    createdAt: "2026-10-20T00:00:00.000Z",
    decidedAt: status === "decided" ? "2026-10-20T01:00:00.000Z" : null,
  },
  messages: [],
  participants: ["Butter", "Claude"].map((name) => ({ conversationId: "CONV-7", name })),
});

let gets = 0;

function serve(answers: Array<"open" | "decided">): void {
  vi.stubGlobal("fetch", async (input: RequestInfo, init?: RequestInit) => {
    if (String(input).endsWith("/conversations/CONV-7")) {
      const status = answers[Math.min(gets, answers.length - 1)];
      gets++;
      return new Response(JSON.stringify(thread(status)), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  });
}

function Pane({ id }: { id: string | null }): React.JSX.Element | null {
  const c = useConversation(id);
  return c.detail ? <ConversationDetail detail={c.detail} onChanged={c.refetch} /> : null;
}

function mount(id: string | null): void {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <Pane id={id} />
    </QueryClientProvider>,
  );
}

/** Let the pending fetch and React's update settle under fake timers. */
async function flush(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 5; i++) await vi.advanceTimersByTimeAsync(0);
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  gets = 0;
});

describe("the conversation detail pane polls", () => {
  it("sends a second GET once HEALTH_POLL_MS has elapsed", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    serve(["open"]);
    mount("CONV-7");
    await flush();
    expect(gets).toBe(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(HEALTH_POLL_MS);
    });
    expect(gets).toBe(2);
  });

  it("drops Sign off as Butter when the poll returns decided", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    serve(["open", "decided"]);
    mount("CONV-7");
    await flush();
    expect(screen.getByRole("button", { name: "Sign off as Butter" })).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(HEALTH_POLL_MS);
    });
    expect(gets).toBe(2);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Sign off as Butter" })).toBeNull());
  });

  it("sends no detail GET when no thread is selected", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    serve(["open"]);
    mount(null);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(HEALTH_POLL_MS);
    });
    expect(gets).toBe(0);
  });
});
