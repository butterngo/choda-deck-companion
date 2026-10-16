// TASK-2482 AC-1 / AC-7 — the theme control lives in the REAL Shell's sidebar
// foot, below Search and Capture, and takes the one-button form on the rail.
// Its own file because it mocks the Shell's polling hooks, which the structural
// tests in Shell.test.tsx do not need.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../../hooks/use-health", () => ({
  useHealth: () => ({
    health: { loopAlive: true, lastPullAgeSec: 1, jwtState: "refresh", reachable: true },
    conn: "connected",
    lastFetchedAgoSec: 1,
  }),
}));
vi.mock("../../hooks/use-pending", () => ({ usePending: () => ({ items: [] }) }));

const { Shell } = await import("../Shell");

function renderShell(): void {
  render(
    <MemoryRouter>
      <Shell />
    </MemoryRouter>
  );
}

describe("Shell theme control", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("sits in the sidebar, after Search and Capture, when expanded", () => {
    localStorage.setItem("sidebar-collapsed", "false");
    renderShell();
    const sidebar = screen.getByTestId("sidebar");
    const group = within(sidebar).getByRole("radiogroup", { name: "Theme" });
    expect(within(group).getAllByRole("radio")).toHaveLength(3);

    const capture = within(sidebar).getByRole("link", { name: /capture/i });
    // DOCUMENT_POSITION_FOLLOWING: the group comes after Capture in the foot.
    expect(capture.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("is a single cycle button when the sidebar is collapsed", () => {
    renderShell(); // collapsed is the default with no stored preference
    const sidebar = screen.getByTestId("sidebar");
    expect(within(sidebar).queryByRole("radiogroup")).toBeNull();
    expect(within(sidebar).getByTestId("theme-cycle")).toHaveAccessibleName(/^Theme: Auto\./);
  });
});
