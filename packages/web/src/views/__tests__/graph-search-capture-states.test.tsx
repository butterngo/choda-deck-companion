// TASK-1597 AC-1 — Graph, Search and Capture render the shared Skeleton /
// EmptyState primitives for their loading and empty branches.
//
// The discriminator is the primitive's own testid, not the copy: a view that
// went back to a bare `<p>` would still render the same words and pass a text
// assertion, so these assert `skeleton` / `empty-state` are actually present.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { HealthView } from "../../hooks/use-health";

const health = (conn: HealthView["conn"]): HealthView => ({
  health: { loopAlive: true, lastPullAgeSec: 5, jwtState: "refresh", reachable: conn !== "disconnected" },
  conn,
  lastFetchedAgoSec: 2,
});

let outletValue: HealthView = health("connected");
const graphState = {
  data: null as { nodes: unknown[]; edges: unknown[] } | null,
  isLoading: false,
  isError: false,
};
const searchState = { result: null as unknown, isLoading: false, isError: false };

vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useOutletContext: () => outletValue,
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
  useNavigate: () => vi.fn(),
}));
vi.mock("../../hooks/use-workspace", () => ({
  useWorkspace: () => ({ workspaceId: "w1", setWorkspaceId: vi.fn() }),
}));
vi.mock("../../hooks/use-workspaces", () => ({
  useWorkspaces: () => ({ workspaces: [{ id: "w1", projectId: "choda-deck" }] }),
}));
vi.mock("../../hooks/use-graph", () => ({ useFullGraph: () => graphState }));
vi.mock("../../hooks/use-knowledge-search", () => ({
  useKnowledgeSearch: () => ({ result: null, isSearching: false, isError: false, search: vi.fn() }),
}));
vi.mock("../../hooks/use-search", () => ({ useSearch: () => searchState }));
// GraphView draws to a canvas-ish surface; not under test here.
vi.mock("../../components/GraphView", () => ({ GraphView: () => <div data-testid="graph-view" /> }));

const { GraphboardView } = await import("../GraphboardView");
const { SearchView } = await import("../SearchView");
const { CaptureView } = await import("../CaptureView");

beforeEach(() => {
  outletValue = health("connected");
  graphState.data = null;
  graphState.isLoading = false;
  graphState.isError = false;
  searchState.result = null;
  searchState.isLoading = false;
  searchState.isError = false;
});

describe("GraphboardView state branches", () => {
  it("renders a skeleton, not bare text, while the graph loads", () => {
    graphState.isLoading = true;
    render(<GraphboardView />);
    expect(screen.getByTestId("skeleton")).toBeInTheDocument();
  });

  it("renders EmptyState for a graph the API answered with no nodes", () => {
    graphState.data = { nodes: [], edges: [] };
    render(<GraphboardView />);
    expect(screen.getByTestId("empty-state")).toBeInTheDocument();
    // Empty is not unreachable — the two must never share a message.
    expect(screen.queryByText(/Can.t reach the laptop API/)).toBeNull();
  });

  it("renders the graph itself once nodes exist", () => {
    graphState.data = { nodes: [{ id: "n1" }], edges: [] };
    render(<GraphboardView />);
    expect(screen.getByTestId("graph-view")).toBeInTheDocument();
    expect(screen.queryByTestId("empty-state")).toBeNull();
  });
});

describe("SearchView state branches", () => {
  it("renders EmptyState before any query is asked", () => {
    render(<SearchView />);
    expect(screen.getByTestId("empty-state")).toBeInTheDocument();
    expect(screen.queryByTestId("skeleton")).toBeNull();
  });
});

describe("CaptureView state branches", () => {
  it("renders EmptyState while idle, not bare instruction text", () => {
    render(<CaptureView />);
    expect(screen.getByTestId("empty-state")).toBeInTheDocument();
  });
});
