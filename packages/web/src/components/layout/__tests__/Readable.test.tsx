import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// GraphEdgesList issues a react-query hook; it needs a provider and is not
// what these assertions are about.
vi.mock("../../GraphEdgesList", () => ({ GraphEdgesList: () => null }));

import { Readable } from "../Readable";
import { KnowledgeDetail } from "../../KnowledgeDetail";
import { TaskDetailPanel } from "../../TaskDetailPanel";
import type { KnowledgeEntry, TaskDetail } from "../../../api";

describe("Readable", () => {
  it("bounds its children to a prose measure", () => {
    render(<Readable>body</Readable>);
    expect(screen.getByTestId("readable").className).toMatch(/max-w-\[72ch\]/);
  });

  it("is left-aligned, never centred", () => {
    // Centring makes the reading column jump position when moving between a
    // bounded detail view and a full-width board. Asserted, not assumed.
    render(<Readable>body</Readable>);
    expect(screen.getByTestId("readable").className).not.toMatch(/mx-auto/);
  });

  it("passes through extra classes without dropping the bound", () => {
    render(<Readable className="mt-4">body</Readable>);
    const el = screen.getByTestId("readable");
    expect(el.className).toMatch(/max-w-\[72ch\]/);
    expect(el.className).toMatch(/mt-4/);
  });
});

describe("prose surfaces are bounded", () => {
  it("KnowledgeDetail renders inside a Readable", () => {
    const entry = {
      slug: "adr-028",
      frontmatter: {
        title: "Honest liveness",
        type: "decision",
        projectId: "p",
        scope: "project",
        refs: [],
        createdAt: "2026-01-01",
        lastVerifiedAt: "2026-01-01",
      },
      body: "prose",
      filePath: "/x/adr-028.md",
      staleness: [],
      isStale: false,
    } as unknown as KnowledgeEntry;
    render(<KnowledgeDetail entry={entry} />);
    expect(screen.getByTestId("readable")).toBeInTheDocument();
  });

  it("TaskDetailPanel renders inside a Readable", () => {
    const task = {
      id: "TASK-1",
      title: "t",
      status: "TODO",
      priority: "low",
      labels: [],
      blockedBy: [],
      body: "prose",
    } as unknown as TaskDetail;
    render(<TaskDetailPanel task={task} />);
    expect(screen.getByTestId("readable")).toBeInTheDocument();
  });
});
