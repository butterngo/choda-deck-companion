import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GraphView } from "../GraphView";
import type { GraphEdge, GraphNode } from "../../api";

const nodes: GraphNode[] = [
  { id: "TASK-1", type: "task" },
  { id: "TASK-2", type: "task" },
  { id: "gotcha-a", type: "knowledge" },
  { id: "ref-x", type: "code_ref" },
];
const edges: GraphEdge[] = [
  { fromId: "TASK-1", toId: "TASK-2", type: "DEPENDS_ON" },
  { fromId: "TASK-2", toId: "gotcha-a", type: "ABOUT" },
  { fromId: "TASK-1", toId: "ref-x", type: "TOUCHES" },
];

describe("GraphView", () => {
  it("renders one line per edge and one node group per connected node", () => {
    const { container } = render(<GraphView nodes={nodes} edges={edges} />);
    expect(container.querySelectorAll("[data-edge]")).toHaveLength(3);
    // 4 nodes, all appear in an edge → all drawn.
    expect(container.querySelectorAll("[data-node]")).toHaveLength(4);
    expect(screen.getByLabelText("knowledge graph")).toBeInTheDocument();
  });

  it("only draws nodes that appear in an edge (isolated nodes are dropped)", () => {
    const withIsolated: GraphNode[] = [...nodes, { id: "TASK-lonely", type: "task" }];
    const { container } = render(<GraphView nodes={withIsolated} edges={edges} />);
    expect(container.querySelectorAll("[data-node]")).toHaveLength(4);
    expect(container.querySelector('[data-node-id="TASK-lonely"]')).toBeNull();
  });

  it("shows the empty state (distinct from loading/disconnected) when there are no relationships", () => {
    render(<GraphView nodes={nodes} edges={[]} />);
    expect(screen.getByRole("status")).toHaveTextContent(/no relationships yet/i);
    expect(screen.queryByLabelText("knowledge graph")).toBeNull();
  });

  it("degrades gracefully past the node ceiling — caps the drawn set and warns", () => {
    const { container } = render(<GraphView nodes={nodes} edges={edges} maxNodes={2} />);
    // TASK-1 (deg 2) + TASK-2 (deg 2) are the most-connected → kept.
    expect(container.querySelectorAll("[data-node]")).toHaveLength(2);
    expect(screen.getByRole("alert")).toHaveTextContent(/showing the 2 most-connected of 4/i);
  });

  it("pre-selects focusNode (Search → Graph deep-link) and shows its detail", () => {
    render(<GraphView nodes={nodes} edges={edges} focusNode="TASK-2" />);
    const panel = screen.getByLabelText("node detail");
    expect(panel).toHaveTextContent("TASK-2");
  });

  it("offers View detail for a task/knowledge node and reports the open request", () => {
    const onOpenNode = vi.fn();
    render(<GraphView nodes={nodes} edges={edges} focusNode="TASK-1" onOpenNode={onOpenNode} />);
    screen.getByRole("button", { name: /view task detail/i }).click();
    expect(onOpenNode).toHaveBeenCalledWith("TASK-1", "task");
  });

  it("clicking a node opens a detail panel listing its connections", () => {
    const { container } = render(<GraphView nodes={nodes} edges={edges} />);
    const node = container.querySelector('[data-node-id="TASK-1"]') as SVGGElement;
    fireEvent.click(node);
    const panel = screen.getByLabelText("node detail");
    expect(panel).toHaveTextContent("TASK-1");
    // TASK-1 connects to TASK-2 and ref-x.
    expect(panel).toHaveTextContent("TASK-2");
    expect(panel).toHaveTextContent("ref-x");
  });

  // TASK-1445 AC-1 — a search highlights matching nodes and dims the rest.
  it("highlights matching nodes and dims non-matches when a search is active", () => {
    const { container } = render(
      <GraphView nodes={nodes} edges={edges} matchIds={new Set(["gotcha-a"])} />,
    );
    const match = container.querySelector('[data-node-id="gotcha-a"]') as SVGGElement;
    const nonMatch = container.querySelector('[data-node-id="TASK-1"]') as SVGGElement;
    expect(match.getAttribute("data-match")).toBe("true");
    expect(match.style.opacity).toBe("1");
    // Non-match keeps rendering (in context) but dimmed.
    expect(nonMatch.getAttribute("data-match")).toBeNull();
    expect(Number(nonMatch.style.opacity)).toBeLessThan(1);
  });

  it("renders normally (no dimming, no match markers) when matchIds is null", () => {
    const { container } = render(<GraphView nodes={nodes} edges={edges} matchIds={null} />);
    expect(container.querySelector("[data-match]")).toBeNull();
    for (const g of container.querySelectorAll<SVGGElement>("[data-node]")) {
      // No search → every node fully opaque.
      expect(g.style.opacity === "" || g.style.opacity === "1").toBe(true);
    }
  });

  // AC-5 — an enabled zero-match query passes an empty Set: nothing highlighted,
  // no stale highlight survives from a prior query.
  it("leaves no highlight on a zero-match (empty) matchIds set", () => {
    const { container } = render(<GraphView nodes={nodes} edges={edges} matchIds={new Set()} />);
    expect(container.querySelector("[data-match]")).toBeNull();
    // Search is still active → all nodes dimmed (none is a match).
    const anyNode = container.querySelector('[data-node-id="TASK-1"]') as SVGGElement;
    expect(Number(anyNode.style.opacity)).toBeLessThan(1);
  });
});
