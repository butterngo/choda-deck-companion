import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { InboxTriage } from "../InboxTriage";
import type { InboxItem } from "../../api";

describe("InboxTriage", () => {
  it("shows the clear-inbox message when there are no items", () => {
    render(<InboxTriage items={[]} />);
    expect(screen.getByText(/inbox is clear/i)).toBeInTheDocument();
  });

  it("renders one row per item with id, status, and content", () => {
    const items: InboxItem[] = [
      { id: "INBOX-1", projectId: "p1", workspaceId: null, content: "investigate X", status: "raw", linkedTaskId: null },
    ];
    render(<InboxTriage items={items} />);
    expect(screen.getByText("INBOX-1")).toBeInTheDocument();
    expect(screen.getByText("raw")).toBeInTheDocument();
    expect(screen.getByText(/investigate X/)).toBeInTheDocument();
  });
});
