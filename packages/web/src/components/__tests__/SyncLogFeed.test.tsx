// TASK-1216 AC-1/AC-2 — feed states + conflict rows visually distinct. Fixtures
// mirror the SyncEvent shape from GET /sync/log (TASK-1215).

import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SyncLogFeed, relTime } from "../SyncLogFeed";
import type { SyncEvent } from "../../api";

const NOW = Date.now();
const EVENTS: SyncEvent[] = [
  { id: 3, at: NOW - 45_000, kind: "pull", upserted: 12, tombstoned: 2, pushed: 0, conflicts: 0, note: null },
  { id: 2, at: NOW - 420_000, kind: "conflict", upserted: 3, tombstoned: 0, pushed: 1, conflicts: 2, note: "TASK-841 updated on both nodes; remote wins" },
  { id: 1, at: NOW - 3_600_000, kind: "drain", upserted: 0, tombstoned: 0, pushed: 0, conflicts: 0, note: null },
];

describe("SyncLogFeed", () => {
  it("renders one row per event, newest-first, with kind badge + counts", () => {
    render(<SyncLogFeed events={EVENTS} isLoading={false} isError={false} />);
    const rows = document.querySelectorAll("li[data-kind]");
    expect(rows).toHaveLength(3);
    expect(rows[0].getAttribute("data-kind")).toBe("pull");
    expect(rows[0].textContent).toContain("+12");
    expect(rows[0].textContent).toContain("−2");
    expect(rows[2].textContent).toContain("no changes");
  });

  it("shows relative time with absolute time on hover (title)", () => {
    render(<SyncLogFeed events={EVENTS} isLoading={false} isError={false} />);
    const pullRow = document.querySelector('li[data-kind="pull"]')!;
    const time = pullRow.querySelector("span[title]")!;
    expect(time.textContent).toBe(relTime(EVENTS[0].at));
    expect(time.getAttribute("title")).toMatch(/\w{3} \d/);
  });

  it("styles conflict rows distinctly from normal rows and shows the note", () => {
    render(<SyncLogFeed events={EVENTS} isLoading={false} isError={false} />);
    const conflict = document.querySelector('li[data-kind="conflict"]')!;
    const pull = document.querySelector('li[data-kind="pull"]')!;
    expect(conflict.className).toContain("border-l-rose-500");
    expect(pull.className).not.toContain("border-l-rose-500");
    expect(conflict.textContent).toContain("remote wins");
    expect(screen.getByText(/2 conflicts/)).toBeInTheDocument();
  });

  it("surfaces a conflict-count badge in the header when conflicts exist", () => {
    render(<SyncLogFeed events={EVENTS} isLoading={false} isError={false} />);
    expect(document.querySelector('[data-conflict-badge="true"]')).not.toBeNull();
  });

  it("filters by kind and shows a filtered-empty message", () => {
    render(<SyncLogFeed events={EVENTS} isLoading={false} isError={false} />);
    fireEvent.click(document.querySelector('button[data-filter="push"]')!);
    expect(document.querySelectorAll("li[data-kind]")).toHaveLength(0);
    expect(document.querySelector('[data-empty="filtered"]')).not.toBeNull();
  });

  it("renders the empty state honestly", () => {
    render(<SyncLogFeed events={[]} isLoading={false} isError={false} />);
    expect(screen.getByText(/no sync activity yet/i)).toBeInTheDocument();
  });

  it("renders loading state", () => {
    render(<SyncLogFeed events={[]} isLoading={true} isError={false} />);
    expect(screen.getByText(/loading sync activity/i)).toBeInTheDocument();
  });

  it("renders error state as an alert, never as empty", () => {
    render(<SyncLogFeed events={[]} isLoading={false} isError={true} />);
    expect(screen.getByRole("alert").textContent).toMatch(/failed to load sync activity/i);
    expect(screen.queryByText(/no sync activity yet/i)).toBeNull();
  });
});
