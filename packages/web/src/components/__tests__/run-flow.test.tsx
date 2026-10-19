// TASK-2538 — the dependency flow of a run. Positions and states are read from
// data attributes, so the test checks the layout rule, not pixel coordinates.

import { describe, it, expect, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import type { RunItem } from "../../api";
import { RunFlow } from "../RunFlow";

const item = (id: string, deps: string[] = [], over: Partial<RunItem> = {}): RunItem => ({
  id,
  title: `Title ${id}`,
  status: "TODO",
  ac: { ticked: 0, total: 0, humanOpen: [] },
  commit: null,
  tests: null,
  activeSince: null,
  deps,
  ...over,
});

let location = { pathname: "", state: null as unknown };
function Probe(): null {
  const l = useLocation();
  location = { pathname: l.pathname, state: l.state };
  return null;
}

function mount(items: RunItem[]): HTMLElement {
  return render(
    <MemoryRouter initialEntries={["/runs"]}>
      <Routes>
        <Route path="/runs" element={<RunFlow items={items} />} />
        <Route path="/tasks/:id" element={<p>task</p>} />
      </Routes>
      <Probe />
    </MemoryRouter>,
  ).container;
}

const box = (c: HTMLElement, id: string): Element | null => c.querySelector(`[data-box="${id}"]`);

afterEach(cleanup);

const CHAIN = [item("A"), item("B", ["A"]), item("C", ["B"]), item("D", ["A", "C"])];

describe("RunFlow", () => {
  it("AC-1: columns follow dependency depth", () => {
    const c = mount(CHAIN);
    expect(["A", "B", "C", "D"].map((id) => box(c, id)?.getAttribute("data-col"))).toEqual(["0", "1", "2", "3"]);
  });

  it("AC-2: one edge per dep, 4 for the chain", () => {
    expect(mount(CHAIN).querySelectorAll("[data-edge]")).toHaveLength(4);
  });

  it("AC-3: a TODO item whose only dep is IMPLEMENTED is ready", () => {
    const c = mount([item("A", [], { status: "IMPLEMENTED" }), item("B", ["A"])]);
    expect(box(c, "B")?.getAttribute("data-state")).toBe("ready");
  });

  it("AC-4: a TODO item whose only dep is TODO is waiting", () => {
    const c = mount([item("A"), item("B", ["A"])]);
    expect(box(c, "B")?.getAttribute("data-state")).toBe("waiting");
  });

  it("AC-5: an item with activeSince is in progress", () => {
    const c = mount([item("A", [], { activeSince: "2026-10-19T10:29:00Z" })]);
    expect(box(c, "A")?.getAttribute("data-state")).toBe("in-progress");
  });

  it("AC-6/AC-7: clicking a box opens /tasks/<id> with from.to = /runs", () => {
    const c = mount(CHAIN);
    fireEvent.click(box(c, "B")!);
    expect(location.pathname).toBe("/tasks/B");
    expect((location.state as { from?: { to?: string } } | null)?.from?.to).toBe("/runs");
  });

  it("AC-8: a cycle renders both boxes and finishes", () => {
    const c = mount([item("A", ["B"]), item("B", ["A"])]);
    expect(c.querySelectorAll("[data-box]")).toHaveLength(2);
  });

  it("CONTROL: an empty item list renders nothing", () => {
    expect(mount([]).querySelector("svg")).toBeNull();
  });
});
