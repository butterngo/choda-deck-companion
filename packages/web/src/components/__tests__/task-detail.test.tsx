// TASK-2598 — a task body's `## Sequence` fence is drawn on the task page, as
// /choda-plan writes it (TASK-2586). jsdom cannot draw mermaid, so MermaidBlock
// is replaced by a marker: the test asks whether the fence reached it.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { TaskDetail } from "../../api";

vi.mock("../MermaidBlock", () => ({
  MermaidBlock: ({ code }: { code: string }) => <div data-testid="mermaid-block">{code}</div>,
}));

const { TaskDetailPanel } = await import("../TaskDetailPanel");

const task = (body: string): TaskDetail => ({
  id: "TASK-1",
  projectId: "p",
  parentTaskId: null,
  title: "Serve the run's criteria",
  status: "READY",
  priority: "high",
  labels: [],
  body,
  blockedBy: [],
});

function mount(body: string): void {
  vi.stubGlobal("fetch", async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } }));
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <TaskDetailPanel task={task(body)} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TaskDetailPanel sequence diagram", () => {
  it("AC-7: a ## Sequence mermaid fence renders a MermaidBlock on the task page", () => {
    mount(["## Context", "", "x", "", "## Sequence", "", "```mermaid", "sequenceDiagram", "  W->>A: GET /runs", "```", ""].join("\n"));
    expect(screen.getByTestId("mermaid-block").textContent).toContain("W->>A: GET /runs");
  });

  it("a body without a fence renders no MermaidBlock", () => {
    mount("## Context\n\nSequence: n/a — docs only\n");
    expect(screen.queryByTestId("mermaid-block")).toBeNull();
  });
});
