// TASK-2386 AC-4 — the Activity header: this week vs last week for the four
// metrics, an arrow each, and in words which direction is good.

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ActivityDigest } from "../../api";
import { WeekCompare, weekCompare } from "../WeekCompare";

function day(i: number, m: Partial<ActivityDigest["metrics"]>): ActivityDigest {
  return {
    date: `2026-09-${String(20 + i).padStart(2, "0")}`,
    metrics: {
      prompts: 100,
      confirmationRate: 0.05,
      waitMinutes: 100,
      activeMinutes: 400,
      projectSwitches: 50,
      switchesPerActiveHour: 10,
      unresolvedPrompts: 0,
      sessionsCompleted: 2,
      mergesToDefault: 8,
      ...m,
    },
  };
}

// Last week: shipped 10/day, 5% confirmations, waiting 25%, 10 switches/h.
// This week: shipped 12/day (better), 8% confirmations (worse), waiting 50% (worse),
// 6 switches/h (better). Every direction is known in advance.
const LAST = Array.from({ length: 7 }, (_, i) => day(i, {}));
const THIS = Array.from({ length: 7 }, (_, i) =>
  day(7 + i, { mergesToDefault: 10, confirmationRate: 0.08, waitMinutes: 200, switchesPerActiveHour: 6 }),
);

describe("WeekCompare (TASK-2386)", () => {
  it("computes this week vs last week for the four metrics", () => {
    const rows = weekCompare([...THIS, ...LAST])!; // out of order on purpose
    const by = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(by.shipped).toMatchObject({ thisWeek: 84, lastWeek: 70, better: "higher" });
    expect(Math.round(by.confirmation!.thisWeek)).toBe(8);
    expect(Math.round(by.waiting!.thisWeek)).toBe(50);
    expect(Math.round(by.waiting!.lastWeek)).toBe(25);
    expect(by.switches).toMatchObject({ thisWeek: 6, lastWeek: 10, better: "lower" });
  });

  it("AC-4: each metric shows an arrow and says which direction is good", () => {
    render(<WeekCompare digests={[...LAST, ...THIS]} />);
    expect(screen.getByText("Tuần này vs tuần trước")).toBeTruthy();
    expect(screen.getByTestId("week-shipped-arrow").textContent).toBe("↑");
    expect(screen.getByTestId("week-shipped").textContent).toContain("cao hơn là tốt · đang tốt lên");
    expect(screen.getByTestId("week-confirmation-arrow").textContent).toBe("↑");
    expect(screen.getByTestId("week-confirmation").textContent).toContain("thấp hơn là tốt · đang xấu đi");
    expect(screen.getByTestId("week-waiting").textContent).toContain("đang xấu đi");
    expect(screen.getByTestId("week-switches-arrow").textContent).toBe("↓");
    expect(screen.getByTestId("week-switches").textContent).toContain("thấp hơn là tốt · đang tốt lên");
  });

  it("AC-4: absent with fewer than 8 days of digests", () => {
    const { container } = render(<WeekCompare digests={THIS} />);
    expect(container.innerHTML).toBe("");
    expect(weekCompare([...THIS, LAST[0]!])).not.toBeNull();
  });
});
