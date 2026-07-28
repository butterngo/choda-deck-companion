import { describe, it, expect } from "vitest";
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
});
