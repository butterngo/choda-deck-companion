import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { KnowledgeDetail } from "../KnowledgeDetail";
import * as api from "../../api";
import type { KnowledgeEntry } from "../../api";

function renderWithClient(ui: React.JSX.Element) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function entry(partial: Partial<KnowledgeEntry>): KnowledgeEntry {
  return {
    slug: "gotcha-1",
    frontmatter: {
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
    body: "# Heading\n\nSome body text.",
    filePath: "docs/knowledge/gotcha-1.md",
    staleness: [],
    isStale: false,
    ...partial,
  };
}

describe("KnowledgeDetail", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("renders the fresh badge and markdown body when not stale", async () => {
    vi.spyOn(api, "fetchGraphEdges").mockResolvedValue({ edges: [] });
    renderWithClient(<KnowledgeDetail entry={entry({})} />);
    expect(screen.getByText("fresh")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Heading" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/no linked edges/i)).toBeInTheDocument());
  });

  it("renders the stale badge and per-ref staleness lines when stale", () => {
    vi.spyOn(api, "fetchGraphEdges").mockResolvedValue({ edges: [] });
    renderWithClient(
      <KnowledgeDetail
        entry={entry({ isStale: true, staleness: [{ path: "src/x.ts", commitSha: "abc1234", commitsSince: 3 }] })}
      />,
    );
    expect(screen.getByText("stale")).toBeInTheDocument();
    expect(screen.getByText(/3 commit\(s\) behind/)).toBeInTheDocument();
  });

  it("lists graph edges once loaded", async () => {
    vi.spyOn(api, "fetchGraphEdges").mockResolvedValue({
      edges: [{ fromId: "TASK-1", toId: "gotcha-1", type: "ABOUT" }],
    });
    renderWithClient(<KnowledgeDetail entry={entry({})} />);
    await waitFor(() => expect(screen.getByText(/TASK-1/)).toBeInTheDocument());
  });
});
