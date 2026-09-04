// TASK-1595 — the sidebar shell + layout contract.
//
// SidebarNav is tested directly (it is presentational and takes counts as
// props); the Shell-level assertions cover the structural contract that a
// component test cannot see — where StatusBar lives, and which element owns
// scroll.

import { describe, it, expect } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { SidebarNav } from "../../components/nav/SidebarNav";
import { StatusBar } from "../../components/StatusBar";
import type { HealthView } from "../../hooks/use-health";

function nav(path: string, counts?: Parameters<typeof SidebarNav>[0]["counts"]) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="*" element={<SidebarNav counts={counts} />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("SidebarNav", () => {
  it("renders the three groups from the design note", () => {
    nav("/projects");
    expect(screen.getByText("Work")).toBeInTheDocument();
    expect(screen.getByText("System")).toBeInTheDocument();
    // Knowledge is a parent control, not a group label.
    expect(screen.getByRole("button", { name: /knowledge/i })).toBeInTheDocument();

    for (const label of ["Projects", "Conversations", "Graph", "Sync"]) {
      expect(screen.getByRole("link", { name: new RegExp(label, "i") })).toBeInTheDocument();
    }
  });

  it("rolls the parent count up from its children rather than hard-coding it", () => {
    // The discriminator: a hard-coded parent count passes any "shows a number"
    // check. 2 + 3 must read as 5.
    nav("/projects", { knowledge: 2, vault: 3 });
    const parent = screen.getByRole("button", { name: /knowledge/i });
    expect(within(parent).getByText("5")).toBeInTheDocument();
  });

  it("removes the children from the accessibility tree when collapsed", () => {
    nav("/projects");
    expect(screen.getByRole("link", { name: /choda knowledge/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /knowledge/i }));

    expect(screen.getByRole("button", { name: /knowledge/i })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
    // Hidden-but-focusable would be worse than absent, so assert absence.
    expect(screen.queryByRole("link", { name: /choda knowledge/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /vault/i })).toBeNull();
  });

  it("stays expanded and active when the route is one of its children", () => {
    // AC-4 — landing on /vault from a URL must not leave the section inert.
    // Even an explicit collapse click cannot hide the section you are inside:
    // hiding the item highlighted as active reads as a bug.
    nav("/vault");
    const parent = screen.getByRole("button", { name: /knowledge/i });
    expect(parent).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(parent);

    expect(screen.getByRole("button", { name: /knowledge/i })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    expect(screen.getByRole("link", { name: /vault/i })).toBeInTheDocument();
  });

  it("omits counts entirely when none are supplied", () => {
    const { container } = nav("/projects");
    // A component that rendered `undefined` or `0` would show stray digits.
    expect(container.textContent).not.toMatch(/\d/);
  });
});

describe("Shell layout contract", () => {
  const health: HealthView = {
    health: { loopAlive: true, lastPullAgeSec: 12, jwtState: "refresh", reachable: true },
    conn: "connected",
    lastFetchedAgoSec: 3,
  };

  it("keeps StatusBar inside the sidebar, not as a sibling of main", () => {
    // AC-5 asserts containment rather than mere presence: a StatusBar rendered
    // above <main> would still be "present".
    render(
      <MemoryRouter>
        <div className="flex">
          <aside data-testid="sidebar">
            <StatusBar view={health} />
          </aside>
          <main data-testid="main" />
        </div>
      </MemoryRouter>
    );
    const sidebar = screen.getByTestId("sidebar");
    expect(within(sidebar).getByRole("status")).toBeInTheDocument();
    expect(within(screen.getByTestId("main")).queryByRole("status")).toBeNull();
  });

  it("renders StatusBar compactly enough for a 216px column", () => {
    // The move from a full-width strip to the sidebar foot is a layout change,
    // so assert the stack direction rather than trusting it.
    render(<StatusBar view={health} />);
    expect(screen.getByRole("status").className).toMatch(/flex-col/);
  });
});

// TASK-1595 AC-7 — the icon rail.
//
// This existed only in the mockup's CSS and was never ported to React: the
// sidebar stayed 216px with labels visible at every width, and 157 green tests
// plus four green gates said nothing. Measured in a real browser, not inferred.
//
// jsdom applies no CSS, so these assert the CLASSES that encode the breakpoint.
// That is weaker than a rendered measurement — the browser check in
// docs/reports/task-1595-ac-verification.md is the real proof — but it is
// enough to fail loudly if someone drops the responsive prefixes again.
describe("Shell icon rail (AC-7)", () => {
  it("SidebarNav labels are sr-only until the rail breakpoint", () => {
    const { container } = nav("/projects");
    const labels = container.querySelectorAll("nav a span");
    expect(labels.length).toBeGreaterThan(0);
    for (const el of labels) {
      // sr-only keeps the accessible name while hiding it visually; `hidden`
      // would strip the name from the a11y tree and leave unlabelled icons.
      if (el.className.includes("tabular-nums")) continue; // counts
      expect(el.className).toMatch(/sr-only/);
      expect(el.className).toMatch(/rail:not-sr-only/);
    }
  });

  it("group labels and counts are display-hidden below the breakpoint", () => {
    const { container } = nav("/projects", { knowledge: 2, vault: 3 });
    expect(screen.getByText("Work").className).toMatch(/hidden rail:block/);
    const count = container.querySelector("span.tabular-nums");
    expect(count?.className).toMatch(/hidden rail:inline/);
  });
});

describe("TASK-1830 — the sidebar does not grow", () => {
  it("still carries exactly eight destinations", () => {
    // Butter's constraint was "i don't want to introduce more menu". The Setup
    // surface is a workspace TAB, so pinning the exact destination set is what
    // proves the constraint was met rather than merely intended.
    //
    // Six here, not eight: Search and Capture are ACTIONS rather than places and
    // live in the Shell foot (Shell.tsx), which SidebarNav does not render. The
    // eight in TASK-1830 AC-1 counts both. Neither is touched by this feature,
    // and a seventh entry here reddens this test.
    nav("/projects");
    const links = screen.getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href")).sort()).toEqual([
      "/conversations",
      "/graph",
      "/knowledge",
      "/projects",
      "/sync",
      "/vault",
    ]);
  });
});
