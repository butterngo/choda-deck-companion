import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { KnowledgeSearchBox } from "../KnowledgeSearchBox";
import * as api from "../../api";

describe("KnowledgeSearchBox", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("shows results and calls onSelect when a result is clicked", async () => {
    vi.spyOn(api, "searchKnowledgeEntries").mockResolvedValue({
      enabled: true,
      results: [
        {
          slug: "gotcha-1",
          projectId: "p1",
          workspaceId: null,
          scope: "project",
          type: "gotcha",
          title: "Gotcha one",
          filePath: "docs/knowledge/gotcha-1.md",
          createdAt: "2026-01-01T00:00:00.000Z",
          lastVerifiedAt: "2026-01-01T00:00:00.000Z",
          distance: 0.1,
        },
      ],
    });
    const onSelect = vi.fn();
    render(<KnowledgeSearchBox onSelect={onSelect} />);
    fireEvent.change(screen.getByPlaceholderText(/search knowledge/i), { target: { value: "cap" } });
    fireEvent.click(screen.getByRole("button", { name: /search/i }));
    await waitFor(() => expect(screen.getByText("Gotcha one")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Gotcha one"));
    expect(onSelect).toHaveBeenCalledWith("gotcha-1");
  });

  it("shows the disabled reason instead of an error when search is off", async () => {
    vi.spyOn(api, "searchKnowledgeEntries").mockResolvedValue({
      enabled: false,
      reason: "embedding store not configured",
      results: [],
    });
    render(<KnowledgeSearchBox onSelect={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/search knowledge/i), { target: { value: "cap" } });
    fireEvent.click(screen.getByRole("button", { name: /search/i }));
    await waitFor(() => expect(screen.getByText(/search is disabled server-side/i)).toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("surfaces a real fetch failure as an alert", async () => {
    vi.spyOn(api, "searchKnowledgeEntries").mockRejectedValue(new Error("HTTP 500"));
    render(<KnowledgeSearchBox onSelect={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/search knowledge/i), { target: { value: "cap" } });
    fireEvent.click(screen.getByRole("button", { name: /search/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/search failed/i));
  });
});
