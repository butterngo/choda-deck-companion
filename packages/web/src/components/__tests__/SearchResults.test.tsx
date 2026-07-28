import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SearchResults } from "../SearchResults";
import type { SearchResult } from "../../api";

const base: SearchResult = {
  query: "graph",
  tasks: [
    { kind: "task", id: "TASK-1", title: "graph view", projectId: "p1", status: "TODO" },
    { kind: "task", id: "TASK-2", title: "graph endpoint", projectId: "p2", status: "DONE" },
  ],
  knowledge: [{ kind: "knowledge", id: "graph-gotcha", title: "graph gotcha", projectId: "p2" }],
  knowledgeEnabled: true,
  knowledgeReason: null,
};

describe("SearchResults", () => {
  it("groups hits by project and renders every hit", () => {
    render(<SearchResults result={base} />);
    expect(screen.getByLabelText("results in p1")).toBeInTheDocument();
    expect(screen.getByLabelText("results in p2")).toBeInTheDocument();
    // p2 holds TASK-2 + the knowledge hit.
    expect(screen.getAllByText(/graph/i).length).toBeGreaterThanOrEqual(3);
  });

  it("shows the empty state when nothing matched", () => {
    render(<SearchResults result={{ ...base, tasks: [], knowledge: [] }} />);
    expect(screen.getByRole("status")).toHaveTextContent(/no matches/i);
  });

  it("warns honestly when knowledge search is degraded", () => {
    render(
      <SearchResults
        result={{ ...base, knowledge: [], knowledgeEnabled: false, knowledgeReason: "embeddings disabled" }}
      />,
    );
    expect(screen.getByRole("note")).toHaveTextContent(/degraded.*embeddings disabled/i);
  });
});
