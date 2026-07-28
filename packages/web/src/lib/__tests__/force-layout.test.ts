import { describe, it, expect } from "vitest";
import { computeForceLayout } from "../force-layout";

describe("computeForceLayout", () => {
  it("returns a finite position for every node id", () => {
    const ids = ["TASK-1", "TASK-2", "gotcha-a"];
    const layout = computeForceLayout(ids, [
      { fromId: "TASK-1", toId: "TASK-2" },
      { fromId: "TASK-2", toId: "gotcha-a" },
    ]);
    expect(layout.size).toBe(3);
    for (const id of ids) {
      const p = layout.get(id);
      expect(p).toBeDefined();
      expect(Number.isFinite(p!.x)).toBe(true);
      expect(Number.isFinite(p!.y)).toBe(true);
    }
  });

  it("is deterministic — same input lays out identically (no Math.random)", () => {
    const ids = ["a", "b", "c", "d"];
    const edges = [{ fromId: "a", toId: "b" }, { fromId: "c", toId: "d" }];
    const first = computeForceLayout(ids, edges);
    const second = computeForceLayout(ids, edges);
    for (const id of ids) {
      expect(second.get(id)).toEqual(first.get(id));
    }
  });

  it("ignores edges whose endpoints aren't in the node set", () => {
    const layout = computeForceLayout(["a", "b"], [
      { fromId: "a", toId: "b" },
      { fromId: "a", toId: "ghost" },
    ]);
    expect(layout.size).toBe(2);
    expect(layout.get("ghost")).toBeUndefined();
  });

  it("handles a single node without dividing by zero", () => {
    const layout = computeForceLayout(["solo"], []);
    const p = layout.get("solo");
    expect(Number.isFinite(p!.x)).toBe(true);
    expect(Number.isFinite(p!.y)).toBe(true);
  });
});
