// TASK-1596 AC-3 — column chrome. Kept in a separate file so the original
// FocusBoard.test.tsx stays byte-for-byte unmodified, which is itself one of
// this task's acceptance criteria.

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FocusBoard } from "../FocusBoard";
import type { FocusFeed } from "../../api";

const feed = (partial: Partial<FocusFeed>): FocusFeed => ({
  workspaceId: "w1",
  projectId: "p1",
  activeSession: null,
  focusTask: null,
  now: [],
  next: [],
  done: [],
  ...partial,
});

describe("FocusBoard column chrome", () => {
  it("shows a per-column count that tracks its bucket", () => {
    render(
      <FocusBoard
        feed={feed({
          now: [{ id: "T-1", title: "a", status: "IN-PROGRESS", priority: "high" }],
          next: [
            { id: "T-2", title: "b", status: "READY", priority: "low" },
            { id: "T-3", title: "c", status: "READY", priority: "low" },
          ],
        })}
      />
    );
    expect(screen.getByTestId("count-now")).toHaveTextContent("1");
    expect(screen.getByTestId("count-next")).toHaveTextContent("2");
    expect(screen.getByTestId("count-done")).toHaveTextContent("0");
  });

  it("gives NOW a rail distinct from NEXT and DONE", () => {
    // The discriminator: three identically-styled rails would still render and
    // still "have a rail". Assert the class tokens actually differ.
    render(<FocusBoard feed={feed({})} />);
    const now = screen.getByTestId("rail-now").className;
    const next = screen.getByTestId("rail-next").className;
    const done = screen.getByTestId("rail-done").className;

    expect(now).not.toBe(next);
    expect(now).not.toBe(done);
    expect(next).not.toBe(done);
  });

  it("keeps a heading per column", () => {
    render(<FocusBoard feed={feed({})} />);
    expect(screen.getByRole("heading", { name: "Now" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Next" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /done/i })).toBeInTheDocument();
  });
});
