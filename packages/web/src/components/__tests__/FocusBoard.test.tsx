import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FocusBoard } from "../FocusBoard";
import type { FocusFeed } from "../../api";

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

describe("FocusBoard", () => {
  it("renders empty-state copy per column when nothing is in any bucket", () => {
    render(<FocusBoard feed={feed({})} />);
    expect(screen.getByText(/nothing in progress/i)).toBeInTheDocument();
    expect(screen.getByText(/nothing ready/i)).toBeInTheDocument();
    expect(screen.getByText(/nothing done recently/i)).toBeInTheDocument();
  });

  it("shows the active session's resume point on the matching NOW card", () => {
    render(
      <FocusBoard
        feed={feed({
          now: [{ id: "TASK-1", title: "Do the thing", status: "IN-PROGRESS", priority: "high" }],
          activeSession: { id: "SESSION-1", taskId: "TASK-1", status: "active", handoff: { resumePoint: "picked up at step 2" } },
        })}
      />,
    );
    expect(screen.getByText("TASK-1")).toBeInTheDocument();
    expect(screen.getByText(/picked up at step 2/)).toBeInTheDocument();
  });

  it("does not attach a resume point to NEXT/DONE cards", () => {
    render(
      <FocusBoard
        feed={feed({
          next: [{ id: "TASK-2", title: "Later task", status: "READY", priority: "low" }],
          activeSession: { id: "SESSION-1", taskId: "TASK-1", status: "active", handoff: { resumePoint: "should not leak here" } },
        })}
      />,
    );
    expect(screen.queryByText(/should not leak here/)).not.toBeInTheDocument();
  });
});
