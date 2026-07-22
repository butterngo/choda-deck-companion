import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { KnowledgeList } from "../KnowledgeList";
import type { KnowledgeListItem } from "../../api";

const items: KnowledgeListItem[] = [
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
  },
];

describe("KnowledgeList", () => {
  it("shows the empty-state message when there are no entries", () => {
    render(
      <KnowledgeList entries={[]} selectedType={null} onSelectType={vi.fn()} selectedSlug={null} onSelect={vi.fn()} />,
    );
    expect(screen.getByText(/no knowledge entries/i)).toBeInTheDocument();
  });

  it("renders one row per entry and calls onSelect when clicked", () => {
    const onSelect = vi.fn();
    render(
      <KnowledgeList entries={items} selectedType={null} onSelectType={vi.fn()} selectedSlug={null} onSelect={onSelect} />,
    );
    screen.getByText("Gotcha one").click();
    expect(onSelect).toHaveBeenCalledWith("gotcha-1");
  });

  it("calls onSelectType when a type filter chip is clicked", () => {
    const onSelectType = vi.fn();
    render(
      <KnowledgeList entries={items} selectedType={null} onSelectType={onSelectType} selectedSlug={null} onSelect={vi.fn()} />,
    );
    screen.getByRole("button", { name: "gotcha" }).click();
    expect(onSelectType).toHaveBeenCalledWith("gotcha");
  });
});
