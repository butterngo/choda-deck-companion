// TASK-1570 — the thread pane. The capture assertion is the point of the whole
// TASK-1565 chain: a screenshot sent to a conversation must reach an <img> with a
// fetchable src.

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConversationDetail } from "../ConversationDetail";
import type { ConversationDetail as Data } from "../../api";

const BASE: Data = {
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
  messages: [],
  participants: [{ conversationId: "CONV-7", name: "companion" }],
};

function withMessages(...contents: string[]): Data {
  return {
    ...BASE,
    messages: contents.map((content, i) => ({
      id: `MSG-${i + 1}`,
      conversationId: "CONV-7",
      authorName: "companion",
      content,
      kind: "message" as const,
      readBy: [],
      createdAt: `2026-08-05T00:00:0${i}.000Z`,
    })),
  };
}

describe("ConversationDetail", () => {
  it("renders the header, id and participants", () => {
    render(<ConversationDetail detail={BASE} />);
    expect(screen.getByRole("heading", { name: "Capture thread" })).toBeInTheDocument();
    expect(screen.getByText(/CONV-7/)).toBeInTheDocument();
    expect(screen.getByText(/companion/)).toBeInTheDocument();
  });

  it("AC-4: renders a screenshot capture inline through CaptureMarkdown", () => {
    render(
      <ConversationDetail
        detail={withMessages("![capture](captures/ab12.png)\n\n(70 bytes)")}
      />,
    );
    expect(screen.getByAltText("capture")).toHaveAttribute(
      "src",
      "/api/artifacts/captures/ab12.png",
    );
  });

  it("AC-4: renders a legacy absolute-path capture too", () => {
    render(
      <ConversationDetail
        detail={withMessages("![capture](C:\\dev\\choda-deck\\data\\artifacts\\captures\\ab12.png)")}
      />,
    );
    expect(screen.getByAltText("capture")).toHaveAttribute(
      "src",
      "/api/artifacts/captures/ab12.png",
    );
  });

  it("AC-4: a HAR capture becomes a download link, not raw text", () => {
    render(<ConversationDetail detail={withMessages("HAR bundle: [3 requests](captures/b1.har)")} />);
    expect(screen.getByRole("link", { name: "3 requests" })).toHaveAttribute(
      "href",
      "/api/artifacts/captures/b1.har",
    );
  });

  it("shows messages oldest-first in the order given", () => {
    render(<ConversationDetail detail={withMessages("first turn", "second turn")} />);
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("first turn");
    expect(items[1]).toHaveTextContent("second turn");
  });

  it("handles an empty thread without blowing up", () => {
    render(<ConversationDetail detail={BASE} />);
    expect(screen.getByText(/No messages in this conversation/)).toBeInTheDocument();
  });

  it("surfaces a decision summary when the thread has one", () => {
    render(
      <ConversationDetail
        detail={{ ...BASE, conversation: { ...BASE.conversation, decisionSummary: "ship it" } }}
      />,
    );
    expect(screen.getByText(/ship it/)).toBeInTheDocument();
  });
});
