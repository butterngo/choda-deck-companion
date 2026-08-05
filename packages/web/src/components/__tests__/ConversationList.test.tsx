// TASK-1570 — the picker.

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConversationList } from "../ConversationList";
import type { ConversationSummary } from "../../api";

function conv(id: string, title: string, status: string): ConversationSummary {
  return {
    id,
    projectId: "choda-deck",
    title,
    status,
    createdBy: "companion",
    decisionSummary: null,
    signedOff: [],
    createdAt: "2026-08-05T00:00:00.000Z",
    decidedAt: null,
  };
}

describe("ConversationList", () => {
  it("shows each conversation's title and status", () => {
    render(
      <ConversationList
        conversations={[conv("CONV-1", "First thread", "open"), conv("CONV-2", "Second", "decided")]}
        selectedId={null}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText("First thread")).toBeInTheDocument();
    expect(screen.getByText("open")).toBeInTheDocument();
    expect(screen.getByText("Second")).toBeInTheDocument();
    expect(screen.getByText("decided")).toBeInTheDocument();
  });

  it("calls onSelect with the clicked id", () => {
    const onSelect = vi.fn();
    render(
      <ConversationList
        conversations={[conv("CONV-1", "First thread", "open")]}
        selectedId={null}
        onSelect={onSelect}
      />,
    );
    screen.getByRole("button", { name: /First thread/ }).click();
    expect(onSelect).toHaveBeenCalledWith("CONV-1");
  });

  it("marks the selected row with aria-current", () => {
    render(
      <ConversationList
        conversations={[conv("CONV-1", "First thread", "open")]}
        selectedId="CONV-1"
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /First thread/ })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("says so when there are no conversations", () => {
    render(<ConversationList conversations={[]} selectedId={null} onSelect={vi.fn()} />);
    expect(screen.getByText(/No conversations yet/)).toBeInTheDocument();
  });
});
