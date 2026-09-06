// TASK-1872 — fullscreen and search over lines already fetched.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { DockerLogs } from "../DockerLogs";

const calls: string[] = [];
let lines: string[] = [];

beforeEach(() => {
  calls.length = 0;
  lines = [
    "2026-09-06 server listening on 5432",
    "2026-09-06 ERROR connection refused",
    "2026-09-06 retrying",
    "2026-09-06 error: second one, lower case",
  ];
  vi.stubGlobal("fetch", (input: RequestInfo) => {
    calls.push(String(input));
    return Promise.resolve(new Response(JSON.stringify({ lines }), { status: 200 }));
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const mount = async (): Promise<void> => {
  render(<DockerLogs containerId="abc123" containerName="jm-db" />);
  await act(async () => {
    await Promise.resolve();
  });
};

const shown = (): string[] =>
  screen.queryAllByTestId("docker-logs-line").map((e) => e.textContent ?? "");

describe("AC-2 / AC-3 — search filters, counts and marks", () => {
  it("hides non-matching lines and reports the count", async () => {
    await mount();
    expect(shown()).toHaveLength(4);

    fireEvent.change(screen.getByTestId("docker-logs-search"), { target: { value: "retrying" } });
    expect(shown()).toHaveLength(1);
    // The count is what separates "nothing matches" from "nothing was logged".
    expect(screen.getByTestId("docker-logs-count").textContent).toContain("1 of 4");
  });

  it("clearing the box restores every line", async () => {
    await mount();
    const box = screen.getByTestId("docker-logs-search");
    fireEvent.change(box, { target: { value: "retrying" } });
    fireEvent.change(box, { target: { value: "" } });
    expect(shown()).toHaveLength(4);
    // With no query there is nothing to count, so the count is absent rather
    // than reading "4 of 4" as if a filter were applied.
    expect(screen.queryByTestId("docker-logs-count")).toBeNull();
  });

  it("matches case-insensitively and marks the hit inside the line", async () => {
    await mount();
    fireEvent.change(screen.getByTestId("docker-logs-search"), { target: { value: "error" } });
    // One line has ERROR, one has error. A case-sensitive match finds one.
    expect(shown()).toHaveLength(2);

    const hits = screen.getAllByTestId("docker-logs-hit").map((e) => e.textContent);
    // The mark carries the text AS IT APPEARS, not the query — otherwise the
    // highlight would rewrite the log line it is supposed to point at.
    expect(hits).toContain("ERROR");
    expect(hits).toContain("error");
  });

  it("an unmatched line renders no mark at all", async () => {
    // CONTROL: without this, "marks are present" could come from a component
    // that marks everything.
    await mount();
    expect(screen.queryAllByTestId("docker-logs-hit")).toHaveLength(0);
  });
});

describe("AC-4 — searching costs nothing", () => {
  it("ten keystrokes issue no request", async () => {
    await mount();
    const before = calls.length;
    const box = screen.getByTestId("docker-logs-search");
    for (const q of ["e", "er", "err", "erro", "error", "erro", "err", "er", "e", ""]) {
      fireEvent.change(box, { target: { value: q } });
    }
    // A keystroke that refetches would shell out to docker on every character.
    expect(calls.length).toBe(before);
  });
});

describe("AC-5 — no matches is a statement", () => {
  it("says so rather than rendering an empty box", async () => {
    await mount();
    fireEvent.change(screen.getByTestId("docker-logs-search"), { target: { value: "zzzz" } });
    expect(screen.getByTestId("docker-logs-nomatch").textContent).toContain("zzzz");
    expect(screen.queryByTestId("docker-logs-body")).toBeNull();
  });

  it("a container that logged nothing says something different", async () => {
    // The discriminator: "no lines match" and "nothing was written" are two
    // different facts and must not share a rendering.
    lines = [];
    await mount();
    expect(screen.getByTestId("docker-logs-empty")).toBeTruthy();
    expect(screen.queryByTestId("docker-logs-nomatch")).toBeNull();
  });
});

describe("AC-1 — fullscreen, and a way back out", () => {
  it("opens an overlay and Escape closes it, returning focus to the control", async () => {
    await mount();
    const opener = screen.getByTestId("docker-logs-fullscreen");
    fireEvent.click(opener);
    expect(screen.getByTestId("docker-logs-overlay")).toBeTruthy();

    await act(async () => {
      fireEvent.keyDown(document, { key: "Escape" });
    });
    expect(screen.queryByTestId("docker-logs-overlay")).toBeNull();
    // Losing focus to the body strands a keyboard reader on a page with no
    // obvious next stop.
    expect(document.activeElement).toBe(screen.getByTestId("docker-logs-fullscreen"));
  });

  it("the search survives entering fullscreen", async () => {
    await mount();
    fireEvent.change(screen.getByTestId("docker-logs-search"), { target: { value: "retrying" } });
    fireEvent.click(screen.getByTestId("docker-logs-fullscreen"));
    // Re-mounting the body with a fresh state would drop the query, which is the
    // thing the reader went fullscreen to look at.
    expect(shown()).toHaveLength(1);
  });
});

describe("AC-6 — the tail control is not decorative", () => {
  it("choosing 1000 issues exactly one request carrying tail=1000", async () => {
    await mount();
    const before = calls.length;
    await act(async () => {
      fireEvent.change(screen.getByTestId("docker-logs-tail"), { target: { value: "1000" } });
    });
    const added = calls.slice(before);
    expect(added).toHaveLength(1);
    // A control that renders and does not change the request is a control that
    // lies about what it did.
    expect(added[0]).toContain("tail=1000");
  });

  it("the first read asks for 200", async () => {
    await mount();
    expect(calls[0]).toContain("tail=200");
  });
});
