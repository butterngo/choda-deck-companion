import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WorkflowActions } from "../WorkflowActions";
import * as api from "../../api";
import type { FocusFeed } from "../../api";

function renderWithClient(ui: React.JSX.Element) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function feed(partial: Partial<FocusFeed>): FocusFeed {
  return {
    workspaceId: "w1",
    projectId: "p1",
    activeSession: null,
    focusTask: null,
    now: [],
    next: [],
    done: [],
    ...partial,
  };
}

describe("WorkflowActions", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("does not call mark-ready when confirm is cancelled", async () => {
    const ready = vi.spyOn(api, "markTaskReady").mockResolvedValue({ task: { id: "TASK-1", title: "t", status: "READY", priority: null } });
    vi.spyOn(window, "confirm").mockReturnValue(false);
    renderWithClient(<WorkflowActions feed={feed({})} projectId="p1" workspaceId="w1" onDone={vi.fn()} />);
    const input = screen.getByPlaceholderText("TASK-NNN");
    fireEvent.change(input, { target: { value: "TASK-1" } });
    screen.getByRole("button", { name: /mark ready/i }).click();
    expect(ready).not.toHaveBeenCalled();
  });

  it("shows Start button for the top NEXT task when no active session, and starts it on confirm", async () => {
    vi.spyOn(api, "startWorkflowSession").mockResolvedValue({ id: "SESSION-2", taskId: "TASK-2", status: "active" });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const onDone = vi.fn();
    renderWithClient(
      <WorkflowActions
        feed={feed({ next: [{ id: "TASK-2", title: "t", status: "READY", priority: null }] })}
        projectId="p1"
        workspaceId="w1"
        onDone={onDone}
      />,
    );
    const btn = screen.getByRole("button", { name: /start task-2/i });
    btn.click();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/session started/i));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("shows End session button when a session is active, and surfaces errors", async () => {
    vi.spyOn(api, "endWorkflowSession").mockRejectedValue(new Error("session SESSION-1 is not active"));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderWithClient(
      <WorkflowActions
        feed={feed({ activeSession: { id: "SESSION-1", taskId: "TASK-1", status: "active" } })}
        projectId="p1"
        workspaceId="w1"
        onDone={vi.fn()}
      />,
    );
    screen.getByRole("button", { name: /end session/i }).click();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/end-session failed/i));
  });
});
