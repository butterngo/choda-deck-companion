// TASK-2592 — `#/knowledge?slug=<slug>` opens that entry on load, without a click.

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { HealthView } from "../../hooks/use-health";

const health: HealthView = {
  health: { loopAlive: true, lastPullAgeSec: 3, jwtState: "refresh", reachable: true },
  conn: "connected",
  lastFetchedAgoSec: 1,
};

vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useOutletContext: () => health,
}));

const listItem = (slug: string, title: string) => ({
  slug,
  projectId: "p1",
  workspaceId: null,
  scope: "project" as const,
  type: "feature" as const,
  title,
  filePath: `docs/knowledge/${slug}.md`,
  createdAt: "2026-01-01T00:00:00.000Z",
  lastVerifiedAt: "2026-01-01T00:00:00.000Z",
});

vi.mock("../../hooks/use-knowledge", () => ({
  useKnowledgeList: () => ({
    entries: [listItem("s1", "BPA x WorkHub integration"), listItem("s2", "Another feature")],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useKnowledgeEntry: (slug: string | null) => ({
    entry:
      slug === "s1"
        ? {
            slug: "s1",
            frontmatter: listItem("s1", "BPA x WorkHub integration"),
            body: "## Why this exists\n\nPlain words.\n",
            filePath: "docs/knowledge/s1.md",
            staleness: [],
            isStale: false,
          }
        : null,
    isLoading: false,
    isError: false,
  }),
}));

const { KnowledgeView } = await import("../KnowledgeView");

function view(at: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[at]}>
        <KnowledgeView />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("KnowledgeView ?slug=", () => {
  it("AC-9: /knowledge?slug=s1 shows that entry in the detail pane without a click", () => {
    view("/knowledge?slug=s1");
    const detail = screen.getByLabelText("knowledge detail");
    expect(detail.textContent).toContain("BPA x WorkHub integration");
  });

  it("/knowledge with no slug opens no entry", () => {
    view("/knowledge");
    expect(screen.queryByLabelText("knowledge detail")).toBeNull();
  });
});
