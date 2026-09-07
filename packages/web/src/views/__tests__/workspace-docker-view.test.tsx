// TASK-1865 AC-8 and the two states that are easy to render as the same nothing.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { WorkspaceDockerView } from "../WorkspaceDockerView";

const calls: string[] = [];
let containersStatus = 200;
let containersBody: unknown = { containers: [] };
let logsBody: unknown = { lines: [] };
let actionStatus = 200;
let actionBody: unknown = { id: "x", state: "exited", tookMs: 10 };

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
  actionStatus = 200;
  actionBody = { id: "x", state: "exited", tookMs: 10 };
  vi.stubGlobal("fetch", (input: RequestInfo) => {
    const url = String(input);
    calls.push(url);
    if (/\/docker\/containers\/[^/]+\/(start|stop|restart)$/.test(url)) {
      return Promise.resolve(
        new Response(JSON.stringify(actionBody), { status: actionStatus }),
      );
    }
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

// ---------------------------------------------------------------------------
// TASK-1866 — starting and stopping, with a confirmation
// ---------------------------------------------------------------------------

const actionCalls = (): string[] =>
  calls.filter((u) => /\/docker\/containers\/[^/]+\/(start|stop|restart)$/.test(u));

describe("AC-6 — a click asks, it does not act", () => {
  it("pressing Stop renders a confirmation and issues nothing", async () => {
    containersBody = { containers: [container("jm-api", "ws-1")] };
    await mount();
    fireEvent.click(screen.getByTestId("docker-act-jm-api"));

    const confirm = screen.getByTestId("docker-confirm");
    // It names the container and the action, so a reader cannot confirm the
    // wrong one by muscle memory.
    expect(confirm.textContent).toContain("jm-api");
    expect(confirm.textContent).toContain("Stop");
    expect(actionCalls()).toHaveLength(0);
  });

  it("cancelling issues nothing and dismisses the question", async () => {
    containersBody = { containers: [container("jm-api", "ws-1")] };
    await mount();
    fireEvent.click(screen.getByTestId("docker-act-jm-api"));
    fireEvent.click(screen.getByTestId("docker-confirm-cancel"));
    expect(actionCalls()).toHaveLength(0);
    expect(screen.queryByTestId("docker-confirm")).toBeNull();
  });

  it("CONTROL — confirming issues exactly one, to the right container", async () => {
    // Without this, "zero calls" above is also satisfied by a button that never
    // works.
    containersBody = { containers: [container("jm-api", "ws-1")] };
    actionBody = { id: "id-jm-api", state: "exited", tookMs: 1400 };
    await mount();
    fireEvent.click(screen.getByTestId("docker-act-jm-api"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("docker-confirm-go"));
    });
    expect(actionCalls()).toHaveLength(1);
    expect(actionCalls()[0]).toContain("/docker/containers/id-jm-api/stop");
  });

  it("offers Start for a stopped container, not Stop", async () => {
    containersBody = { containers: [container("down-one", "ws-1", "exited")] };
    await mount();
    fireEvent.click(screen.getByTestId("docker-act-down-one"));
    expect(screen.getByTestId("docker-confirm").textContent).toContain("Start");
  });
});

describe("AC-7 — the row shows what IS, not what was asked", () => {
  it("takes the state from the response, even when it is not the one requested", async () => {
    containersBody = { containers: [container("stubborn", "ws-1")] };
    // The action succeeded and the container is STILL running. That is possible,
    // and the row must say so rather than report the intent behind the click.
    actionBody = { id: "id-stubborn", state: "running", tookMs: 10600 };
    await mount();
    fireEvent.click(screen.getByTestId("docker-act-stubborn"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("docker-confirm-go"));
    });
    expect(screen.getByTestId("docker-row-stubborn").getAttribute("data-state")).toBe("running");
    expect(screen.getByTestId("docker-action-note").textContent).toContain("now running");
  });

  it("a 409 says it did not stop in time, and leaves the row alone", async () => {
    containersBody = { containers: [container("slow", "ws-1")] };
    actionStatus = 409;
    actionBody = { error: "still running", tookMs: 15000 };
    await mount();
    fireEvent.click(screen.getByTestId("docker-act-slow"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("docker-confirm-go"));
    });
    expect(screen.getByTestId("docker-action-note").textContent).toContain("did not stop in time");
    // Not flipped to exited on a timeout — that would be the UI inventing a
    // state the daemon never reported.
    expect(screen.getByTestId("docker-row-slow").getAttribute("data-state")).toBe("running");
  });
});

// TASK-1892 — the tab was clipped, not scrolled.
//
// jsdom has no layout, so none of this can measure a scrollbar. What it CAN
// prove is the structure that produces one: a single element that owns the
// overflow, every row inside it, and the sub-tab strip outside it. A test that
// only asserted a class name would pass against a class on any div in the tree,
// which is why containment is asserted instead.
describe("TASK-1892 — the Docker tab scrolls on a short viewport", () => {
  const many = (n: number): Record<string, unknown>[] =>
    Array.from({ length: n }, (_, i) => container(`c${i}`, "ws-1"));

  it("AC-1 — one scroll container owns the overflow, and it is the only one", async () => {
    containersBody = { containers: many(3) };
    await mount();
    const scroll = screen.getByTestId("docker-scroll");
    expect(scroll.className).toContain("overflow-y-auto");
    // The whole point of "one": a second scrolling ancestor inside this tab
    // would trap the wheel in whichever the pointer happened to be over.
    const scrollers = Array.from(
      document.querySelectorAll<HTMLElement>("[class*='overflow-y-auto']"),
    );
    expect(scrollers).toHaveLength(1);
    expect(scrollers[0]).toBe(scroll);
  });

  it("AC-2 — with more rows than fit, the LAST one is inside the scroll container", async () => {
    containersBody = { containers: many(30) };
    await mount();
    const scroll = screen.getByTestId("docker-scroll");
    const last = screen.getByTestId("docker-row-c29");
    expect(scroll.contains(last)).toBe(true);
    // A control on the first row too: "inside" must not be satisfied by the
    // list starting in the scroller and overflowing out of it, which is what
    // the old markup effectively did at the pane boundary.
    expect(scroll.contains(screen.getByTestId("docker-row-c0"))).toBe(true);
    expect(screen.getAllByTestId(/^docker-row-/).length).toBe(30);
  });

  it("AC-2 — the unattached section scrolls with the list, not past it", async () => {
    containersBody = {
      containers: [...many(12), container("stray", null), container("stray2", null)],
    };
    await mount();
    const scroll = screen.getByTestId("docker-scroll");
    expect(scroll.contains(screen.getByTestId("docker-unattached"))).toBe(true);
  });

  it("AC-3 — the Images sub-tab renders inside the same scroll container", async () => {
    containersBody = { containers: many(2) };
    await mount();
    await act(async () => {
      fireEvent.click(screen.getByTestId("docker-subtab-images"));
    });
    const scroll = screen.getByTestId("docker-scroll");
    // Whatever Images renders — a list, a note, or a failure — it must be in
    // the scroller, or switching sub-tabs silently loses the ability to scroll.
    expect(scroll.textContent).not.toBe("");
    expect(scroll.contains(screen.getByTestId("docker-subtab-images"))).toBe(false);
  });

  it("AC-4 — the sub-tab strip stays OUTSIDE the scroll, and nothing scrolls sideways", async () => {
    containersBody = { containers: many(30) };
    await mount();
    const scroll = screen.getByTestId("docker-scroll");
    expect(scroll.contains(screen.getByTestId("docker-subtab-containers"))).toBe(false);
    expect(scroll.contains(screen.getByTestId("docker-subtab-images"))).toBe(false);
    // The rows truncate rather than widen; a horizontal scrollbar here would
    // mean a row is pushing the pane, which is a layout bug, not a long list.
    expect(scroll.className).toContain("overflow-x-hidden");
  });
});

// TASK-1896 — one pane at a time, and a way out of it.
//
// Both panes used to be their own state, so "both open" was reachable by
// clicking two buttons, and neither could be dismissed at all.
describe("TASK-1896 — Logs and Files are one pane, and it closes", () => {
  const two = (): Record<string, unknown>[] => [
    container("api", "ws-1"),
    container("db", "ws-1"),
  ];

  const openFiles = async (name: string): Promise<void> => {
    await act(async () => {
      fireEvent.click(screen.getByTestId(`docker-files-${name}`));
    });
  };
  const openLogs = async (name: string): Promise<void> => {
    await act(async () => {
      fireEvent.click(screen.getByTestId(`docker-logs-${name}`));
    });
  };

  it("AC-1 — opening Logs closes Files", async () => {
    containersBody = { containers: two() };
    await mount();
    await openFiles("api");
    expect(screen.getByTestId("container-files")).toBeTruthy();

    await openLogs("api");

    expect(screen.queryByTestId("container-files")).toBeNull();
    expect(screen.getByTestId("docker-logs-pane")).toBeTruthy();
  });

  it("AC-1 — opening Files closes Logs", async () => {
    // The reverse direction as its own test: a single handler that clears the
    // other state can be right in one direction and forgotten in the other.
    containersBody = { containers: two() };
    await mount();
    await openLogs("api");
    expect(screen.getByTestId("docker-logs-pane")).toBeTruthy();

    await openFiles("api");

    expect(screen.queryByTestId("docker-logs-pane")).toBeNull();
    expect(screen.getByTestId("container-files")).toBeTruthy();
  });

  it("AC-1 — a pane on one container closes when the OTHER container's pane opens", async () => {
    containersBody = { containers: two() };
    await mount();
    await openLogs("api");
    await openFiles("db");
    expect(screen.queryByTestId("docker-logs-pane")).toBeNull();
    expect(screen.getByTestId("container-files")).toBeTruthy();
  });

  it("AC-2 — clicking the open pane's own button closes it, and reads nothing", async () => {
    containersBody = { containers: two() };
    await mount();
    await openLogs("api");
    const before = calls.filter((c) => c.includes("/docker/logs")).length;
    expect(before).toBe(1);

    await openLogs("api");

    expect(screen.queryByTestId("docker-logs-pane")).toBeNull();
    // Closing is not a read. A close that refetched would shell out to docker
    // to render nothing.
    expect(calls.filter((c) => c.includes("/docker/logs"))).toHaveLength(before);
  });

  it("AC-3 — the logs pane's own Close dismisses it", async () => {
    containersBody = { containers: two() };
    await mount();
    await openLogs("api");
    await act(async () => {
      fireEvent.click(screen.getByTestId("docker-logs-close"));
    });
    expect(screen.queryByTestId("docker-logs-pane")).toBeNull();
  });

  it("AC-3 — the files pane's own Close dismisses it", async () => {
    containersBody = { containers: two() };
    await mount();
    await openFiles("api");
    await act(async () => {
      fireEvent.click(screen.getByTestId("cf-close"));
    });
    expect(screen.queryByTestId("container-files")).toBeNull();
  });

  it("AC-4 — Files on another container SWITCHES rather than closing", async () => {
    containersBody = { containers: two() };
    await mount();
    await openFiles("api");
    expect(screen.getByTestId("container-files").textContent).toContain("api");

    await openFiles("db");

    // Still open, and now naming db — the comparison a reader is actually
    // making when they click the second container.
    expect(screen.getByTestId("container-files")).toBeTruthy();
    expect(screen.getByTestId("container-files").textContent).toContain("db");
    expect(screen.getByTestId("container-files").textContent).not.toContain("Inside api");
  });

  it("AC-5 — the open container's button says it will hide, and no other row does", async () => {
    containersBody = { containers: two() };
    await mount();
    await openLogs("api");

    const opened = screen.getByTestId("docker-logs-api");
    expect(opened.textContent).toBe("Hide logs");
    expect(opened.getAttribute("aria-pressed")).toBe("true");
    // The other row is untouched — the label belongs to the pane that is open,
    // not to the button that was clicked last.
    expect(screen.getByTestId("docker-logs-db").textContent).toBe("Logs");
    expect(screen.getByTestId("docker-logs-db").getAttribute("aria-pressed")).toBe("false");
    // And the same container's Files button does not claim to be open.
    expect(screen.getByTestId("docker-files-api").textContent).toBe("Files");
  });

  it("AC-6 — closing returns focus to the button that opened the pane", async () => {
    containersBody = { containers: two() };
    await mount();
    await openFiles("api");
    await act(async () => {
      fireEvent.click(screen.getByTestId("cf-close"));
    });
    // Not the body: a keyboard reader closing a pane must land back where they
    // were, which is the obligation the fullscreen overlay already carries.
    expect(document.activeElement).toBe(screen.getByTestId("docker-files-api"));
  });
});
