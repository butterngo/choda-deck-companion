// TASK-1865 AC-8 and the two states that are easy to render as the same nothing.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { WorkspaceDockerView } from "../WorkspaceDockerView";

const calls: string[] = [];
let containersStatus = 200;
let containersBody: unknown = { containers: [] };
let logsBody: unknown = { lines: [] };

const container = (
  name: string,
  workspaceId: string | null,
  state = "running",
  project: string | null = "p",
): Record<string, unknown> => ({
  id: `id-${name}`,
  name,
  state,
  status: state === "running" ? "Up 3 hours" : "Exited (0) 2 days ago",
  image: "node:22-alpine",
  project,
  workingDir: workspaceId === null ? null : "C:\\dev\\x",
  workspaceId,
});

beforeEach(() => {
  calls.length = 0;
  containersStatus = 200;
  containersBody = { containers: [] };
  logsBody = { lines: [] };
  vi.stubGlobal("fetch", (input: RequestInfo) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("/docker/logs")) {
      return Promise.resolve(new Response(JSON.stringify(logsBody), { status: 200 }));
    }
    return Promise.resolve(
      new Response(JSON.stringify(containersBody), { status: containersStatus }),
    );
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const mount = async (): Promise<void> => {
  render(<WorkspaceDockerView workspaceId="ws-1" />);
  await act(async () => {
    await Promise.resolve();
  });
};

describe("AC-4 — no daemon is a capability, not an error", () => {
  it("renders a note and no error state", async () => {
    containersStatus = 501;
    containersBody = { error: "docker not available" };
    await mount();
    expect(screen.getByTestId("docker-unavailable")).toBeTruthy();
    // Painting an absent tool red is how a reader learns to skip the real errors.
    expect(screen.queryByTestId("error-state")).toBeNull();
  });
});

describe("AC-8 — no containers is a statement, not an empty pane", () => {
  it("says so, and says what attaches one", async () => {
    containersBody = { containers: [] };
    await mount();
    const none = screen.getByTestId("docker-none");
    // The distinction: "none here" and "we did not look" must not render alike.
    expect(none.textContent).toContain("No containers are attached");
    expect(none.textContent).toContain("docker compose");
  });

  it("CONTROL — with containers, the empty statement is absent", async () => {
    // Without this, the assertion above would pass against a view that always
    // shows the empty message.
    containersBody = { containers: [container("jm-api", "ws-1")] };
    await mount();
    expect(screen.queryByTestId("docker-none")).toBeNull();
    expect(screen.getByTestId("docker-row-jm-api")).toBeTruthy();
  });
});

describe("AC-1 / AC-2 — the list is honest about both halves", () => {
  it("shows exited containers, distinguished from running ones", async () => {
    containersBody = {
      containers: [container("up-one", "ws-1"), container("down-one", "ws-1", "exited")],
    };
    await mount();
    expect(screen.getByTestId("docker-row-up-one").getAttribute("data-state")).toBe("running");
    // A reader looking for a container is usually looking for one that stopped.
    expect(screen.getByTestId("docker-row-down-one").getAttribute("data-state")).toBe("exited");
    expect(screen.getByTestId("docker-verdict").textContent).toContain("1 running");
  });

  it("lists unattached containers separately and never claims them", async () => {
    containersBody = {
      containers: [container("mine", "ws-1"), container("stray", null, "running", null)],
    };
    await mount();
    const unattached = screen.getByTestId("docker-unattached");
    expect(unattached.textContent).toContain("Unattached");
    // The count for THIS workspace must not include the stray one — that would
    // be attributing a container the daemon gave us nothing to attribute by.
    expect(screen.getByTestId("docker-verdict").textContent).toContain("1 container");
    expect(unattached.textContent).toContain("nothing on them that says which project");
  });

  it("a container belonging to another workspace appears in neither list", async () => {
    // CONTROL for the filter itself: without it, "1 container" could come from
    // a view that shows everything and counts everything.
    containersBody = {
      containers: [container("mine", "ws-1"), container("theirs", "ws-2")],
    };
    await mount();
    expect(screen.getByTestId("docker-row-mine")).toBeTruthy();
    expect(screen.queryByTestId("docker-row-theirs")).toBeNull();
    expect(screen.queryByTestId("docker-unattached")).toBeNull();
  });
});

describe("logs are a read, taken on request", () => {
  it("fetches nothing until the control is pressed, then exactly one", async () => {
    containersBody = { containers: [container("jm-api", "ws-1")] };
    await mount();
    expect(calls.filter((u) => u.includes("/docker/logs"))).toHaveLength(0);

    logsBody = { lines: ["first", "second"] };
    await act(async () => {
      fireEvent.click(screen.getByTestId("docker-logs-jm-api"));
    });
    const logCalls = calls.filter((u) => u.includes("/docker/logs"));
    expect(logCalls).toHaveLength(1);
    // The id is passed encoded; the adapter validates it against the daemon's
    // own list before any argv is built (TASK-1865 AC-7).
    expect(logCalls[0]).toContain("id=id-jm-api");
    expect(screen.getByTestId("docker-logs-pane").textContent).toContain("second");
  });

  it("a container that wrote nothing says so", async () => {
    containersBody = { containers: [container("quiet", "ws-1")] };
    await mount();
    logsBody = { lines: [] };
    await act(async () => {
      fireEvent.click(screen.getByTestId("docker-logs-quiet"));
    });
    // An empty pre is indistinguishable from a failed read.
    expect(screen.getByTestId("docker-logs-empty")).toBeTruthy();
  });
});
