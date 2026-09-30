// TASK-1765 — the Projects → Workspaces entry point.
//
// The assertions this file exists for:
//  1. An unreachable adapter and a genuinely empty project list must not
//     produce the same output (the TASK-1597 rule). Both directions asserted,
//     so neither can pass by accident.
//  2. Selecting a project shows ONLY that project's workspaces. A filter that
//     forgot its predicate would still render rows and still look right.
//  3. An archived workspace is shown but MARKED. Dropping it would silently
//     misreport what is registered; rendering it plain would lie about state.
//
// State primitives are asserted by data-testid, never by copy — a view
// regressed to a bare <p> renders the same words and passes a text assertion.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { HealthView } from "../../hooks/use-health";
import type { Project, Workspace } from "../../api";

const health = (conn: HealthView["conn"]): HealthView => ({
  health: { loopAlive: true, lastPullAgeSec: 5, jwtState: "refresh", reachable: conn !== "disconnected" },
  conn,
  lastFetchedAgoSec: 2,
});

let outletValue: HealthView = health("connected");

const PROJECTS: Project[] = [
  { id: "choda-deck", name: "Choda Deck", cwd: "C:\\dev\\choda-deck" },
  { id: "english-companion", name: "English Companion", cwd: "C:\\dev\\english-companion" },
];

const WORKSPACES: Workspace[] = [
  { id: "choda-deck-companion", projectId: "choda-deck", label: "Companion", cwd: "C:\\dev\\choda-deck-companion", archivedAt: null },
  { id: "main", projectId: "choda-deck", label: "Main", cwd: "C:\\dev\\choda-deck", archivedAt: null },
  { id: "retired", projectId: "choda-deck", label: "Retired", cwd: "C:\\dev\\old", archivedAt: "2026-01-01" },
  { id: "web", projectId: "english-companion", label: "Web", cwd: "C:\\dev\\english-companion", archivedAt: null },
];

const state = {
  projects: PROJECTS,
  isLoading: false,
  isError: false,
  workspacesOf: (id: string) => WORKSPACES.filter((w) => w.projectId === id),
  liveCountOf: (id: string) => WORKSPACES.filter((w) => w.projectId === id && w.archivedAt === null).length,
};

vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useOutletContext: () => outletValue,
}));
// Only the hook is replaced; the pure grouping rule (TASK-2200) stays real, so
// the view is tested against the same function it ships with.
vi.mock("../../hooks/use-projects", async (orig) => ({
  ...(await orig<typeof import("../../hooks/use-projects")>()),
  useProjects: () => state,
}));

const { ProjectsView } = await import("../ProjectsView");

function mount(): void {
  render(
    <MemoryRouter>
      <ProjectsView />
    </MemoryRouter>,
  );
}

describe("ProjectsView (TASK-1765)", () => {
  beforeEach(() => {
    outletValue = health("connected");
    state.projects = PROJECTS;
    state.isLoading = false;
    state.isError = false;
  });

  it("lists every project from the adapter", () => {
    mount();
    expect(screen.getByTestId("project-row-choda-deck")).toBeTruthy();
    expect(screen.getByTestId("project-row-english-companion")).toBeTruthy();
  });

  it("shows only the SELECTED project's workspaces", () => {
    mount();
    fireEvent.click(screen.getByTestId("project-row-choda-deck"));
    expect(screen.getByTestId("workspace-row-choda-deck-companion")).toBeTruthy();
    expect(screen.getByTestId("workspace-row-main")).toBeTruthy();
    // The discriminating half: a filter that dropped its predicate would still
    // render rows, and every assertion above would still pass.
    expect(screen.queryByTestId("workspace-row-web")).toBeNull();
  });

  it("marks an archived workspace instead of hiding or normalising it", () => {
    mount();
    fireEvent.click(screen.getByTestId("project-row-choda-deck"));
    expect(screen.getByTestId("workspace-row-retired")).toBeTruthy();
    expect(screen.getByTestId("workspace-archived-retired")).toBeTruthy();
    // Control: a live workspace must NOT carry the marker, or the badge proves
    // nothing about state.
    expect(screen.queryByTestId("workspace-archived-main")).toBeNull();
  });

  it("counts only LIVE workspaces — a count is a claim about what is usable", () => {
    mount();
    // choda-deck has 3 workspaces, one archived.
    expect(screen.getByTestId("project-row-choda-deck").textContent).toContain("2");
  });

  it("links each workspace to its workspace page, so the route is reachable by click", () => {
    mount();
    fireEvent.click(screen.getByTestId("project-row-choda-deck"));
    const href = screen.getByTestId("workspace-row-main").getAttribute("href");
    // TASK-1766 moved this from a docs deep-link to the workspace PLACE, which
    // carries both docs and tasks.
    expect(href).toBe("/workspaces/main");
  });

  it("renders unreachable as ErrorState, NOT as an empty list", () => {
    outletValue = health("disconnected");
    mount();
    expect(screen.getByTestId("error-state")).toBeTruthy();
    expect(screen.queryByTestId("empty-state")).toBeNull();
  });

  it("renders a genuinely empty project list as EmptyState, NOT as an error", () => {
    state.projects = [];
    mount();
    expect(screen.getByTestId("empty-state")).toBeTruthy();
    expect(screen.queryByTestId("error-state")).toBeNull();
  });

  it("renders loading as a Skeleton", () => {
    state.isLoading = true;
    mount();
    expect(screen.getByTestId("skeleton")).toBeTruthy();
  });

  it("prompts for a selection before any workspace pane is shown", () => {
    mount();
    // Nothing selected yet: the detail pane says so rather than rendering an
    // empty workspace list that reads as "this project has none".
    expect(screen.getByTestId("empty-state")).toBeTruthy();
    expect(screen.queryByTestId("workspace-list")).toBeNull();
  });
});

// TASK-2200 — projects grouped by organisation.
describe("ProjectsView — grouped by org (TASK-2200)", () => {
  const ORG_PROJECTS: Project[] = [
    { id: "choda-deck", name: "Choda Deck", cwd: "C:\\dev\\choda-deck", org: "personal" },
    { id: "headless-cms", name: "Headless CMS", cwd: "C:\\dev\\test\\headless-cms", org: "ichiba" },
    { id: "pim", name: "PIM", cwd: "C:\\vault", org: "ichiba" },
    { id: "loose", name: "Loose", cwd: "C:\\dev\\loose", org: null },
  ];

  beforeEach(() => {
    outletValue = health("connected");
    state.projects = ORG_PROJECTS;
    state.isLoading = false;
    state.isError = false;
  });

  function groupOf(projectId: string): string | null {
    const row = screen.getByTestId(`project-row-${projectId}`);
    return row.closest("[data-testid^='project-group-']")?.getAttribute("data-testid") ?? null;
  }

  it("puts each project under its org, and org-less projects under one No organisation group", () => {
    mount();
    expect(groupOf("headless-cms")).toBe("project-group-ichiba");
    expect(groupOf("pim")).toBe("project-group-ichiba");
    expect(groupOf("choda-deck")).toBe("project-group-personal");
    expect(groupOf("loose")).toBe("project-group-none");
    expect(screen.getByTestId("project-group-toggle-none").textContent).toContain("No organisation");
  });

  it("orders named orgs alphabetically with No organisation last", () => {
    mount();
    const order = screen
      .getAllByTestId(/^project-group-(?!toggle)/)
      .map((el) => el.getAttribute("data-testid"));
    expect(order).toEqual(["project-group-ichiba", "project-group-personal", "project-group-none"]);
  });

  it("collapses and expands a group, hiding only that group's rows", () => {
    mount();
    const toggle = screen.getByTestId("project-group-toggle-ichiba");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByTestId("project-row-pim").closest("ul")?.hidden).toBe(true);
    expect(screen.getByTestId("project-row-choda-deck").closest("ul")?.hidden).toBe(false);

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByTestId("project-row-pim").closest("ul")?.hidden).toBe(false);
  });

  it("renders the plain list, with no group headers, when no project has an org", () => {
    state.projects = PROJECTS;
    mount();
    expect(screen.getByTestId("project-row-choda-deck")).toBeTruthy();
    expect(screen.queryByTestId("project-group-toggle-none")).toBeNull();
  });
});
