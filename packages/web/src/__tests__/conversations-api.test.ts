// TASK-1570 AC-1 — fetchConversations / fetchConversation wire the two adapter
// routes and return their envelopes. Mirrors the fetchSyncLog contract; the hook
// (use-conversations) is a thin react-query wrapper over these.

import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchConversation, fetchConversations, type ConversationDetail } from "../api";

const DETAIL: ConversationDetail = {
  conversation: {
    id: "CONV-7",
    projectId: "choda-deck",
    title: "Capture thread",
    status: "open",
    createdBy: "companion",
    decisionSummary: null,
    signedOff: [],
    createdAt: "2026-08-05T00:00:00.000Z",
    decidedAt: null,
  },
  messages: [
    {
      id: "MSG-1",
      conversationId: "CONV-7",
      authorName: "companion",
      content: "![capture](captures/ab12.png)",
      kind: "message",
      readBy: [],
      createdAt: "2026-08-05T00:00:01.000Z",
    },
  ],
  participants: [{ conversationId: "CONV-7", name: "companion" }],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(payload: unknown): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async () => ({ ok: true, status: 200, json: async () => payload }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("fetchConversations", () => {
  it("GETs /api/conversations and returns the envelope", async () => {
    const fetchFn = stubFetch({ conversations: [DETAIL.conversation] });
    const res = await fetchConversations();
    expect(fetchFn.mock.calls[0]?.[0]).toBe("/api/conversations");
    expect(res.conversations).toHaveLength(1);
  });
});

describe("fetchConversation", () => {
  it("GETs /api/conversations/:id and returns conversation + messages + participants", async () => {
    const fetchFn = stubFetch(DETAIL);
    const res = await fetchConversation("CONV-7");
    expect(fetchFn.mock.calls[0]?.[0]).toBe("/api/conversations/CONV-7");
    expect(res.conversation.id).toBe("CONV-7");
    expect(res.messages[0]?.authorName).toBe("companion");
    // The capture markdown must arrive untouched — it is what gets rendered.
    expect(res.messages[0]?.content).toBe("![capture](captures/ab12.png)");
    expect(res.participants[0]?.name).toBe("companion");
  });

  it("encodes the id so an odd character cannot break the path", async () => {
    const fetchFn = stubFetch(DETAIL);
    await fetchConversation("CONV/7 8");
    expect(fetchFn.mock.calls[0]?.[0]).toBe("/api/conversations/CONV%2F7%208");
  });
});
