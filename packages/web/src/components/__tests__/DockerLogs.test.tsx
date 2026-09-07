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

// TASK-1893 — the pane was a snapshot with no way to re-read it.
describe("TASK-1893 — refreshing the log", () => {
  const logCalls = (): string[] => calls.filter((c) => c.includes("/docker/logs"));

  it("AC-1 — one click issues exactly one more read, on the same tail", async () => {
    await mount();
    expect(logCalls()).toHaveLength(1);
    const first = logCalls()[0];

    await act(async () => {
      fireEvent.click(screen.getByTestId("docker-logs-refresh"));
    });

    expect(logCalls()).toHaveLength(2);
    // Same URL: a refresh must not quietly change what it asks for. If this
    // ever differs, the button is doing something other than re-reading.
    expect(logCalls()[1]).toBe(first);
    expect(logCalls()[1]).toContain("tail=200");
  });

  it("AC-1 — the second read's lines REPLACE the first's", async () => {
    await mount();
    expect(shown()).toHaveLength(4);
    lines = ["2026-09-07 restarted", "2026-09-07 listening"];
    await act(async () => {
      fireEvent.click(screen.getByTestId("docker-logs-refresh"));
    });
    expect(shown()).toEqual(["2026-09-07 restarted", "2026-09-07 listening"]);
  });

  it("AC-4 — a shorter second read does not leave the old lines behind", async () => {
    // The restart case, stated as its own test because appending would still
    // pass the AC-1 test above: 2 new lines after 4 old ones "renders the new
    // lines" perfectly well while lying about the log.
    await mount();
    lines = ["only this one"];
    await act(async () => {
      fireEvent.click(screen.getByTestId("docker-logs-refresh"));
    });
    expect(shown()).toHaveLength(1);
    expect(shown()[0]).not.toContain("server listening");
  });

  it("AC-2 — the query and the tail survive a refresh, and so does the count", async () => {
    await mount();
    fireEvent.change(screen.getByTestId("docker-logs-tail"), { target: { value: "1000" } });
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.change(screen.getByTestId("docker-logs-search"), { target: { value: "error" } });
    expect(screen.getByTestId("docker-logs-count").textContent).toContain("2 of 4");

    await act(async () => {
      fireEvent.click(screen.getByTestId("docker-logs-refresh"));
    });

    expect((screen.getByTestId("docker-logs-search") as HTMLInputElement).value).toBe("error");
    expect((screen.getByTestId("docker-logs-tail") as HTMLSelectElement).value).toBe("1000");
    expect(logCalls()[logCalls().length - 1]).toContain("tail=1000");
    // The filter is still APPLIED to the new lines, not merely still typed in
    // the box — the count proves which.
    expect(screen.getByTestId("docker-logs-count").textContent).toContain("2 of 4");
    expect(shown()).toHaveLength(2);
  });

  it("AC-3 — a second click while one read is in flight issues nothing", async () => {
    let release: (() => void) | null = null;
    vi.stubGlobal("fetch", (input: RequestInfo) => {
      calls.push(String(input));
      if (calls.length === 1) {
        return Promise.resolve(new Response(JSON.stringify({ lines }), { status: 200 }));
      }
      return new Promise<Response>((resolve) => {
        release = () => resolve(new Response(JSON.stringify({ lines }), { status: 200 }));
      });
    });
    await mount();

    await act(async () => {
      fireEvent.click(screen.getByTestId("docker-logs-refresh"));
    });
    const btn = screen.getByTestId("docker-logs-refresh") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toContain("Refresh");

    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(logCalls()).toHaveLength(2);

    await act(async () => {
      release?.();
      await Promise.resolve();
    });
    expect((screen.getByTestId("docker-logs-refresh") as HTMLButtonElement).disabled).toBe(false);
  });

  it("AC-3 — the in-flight refresh does not blank the lines it is replacing", async () => {
    // The reason `refreshing` is not `busy`: a skeleton here would hide the
    // only true thing on screen for the length of a docker call.
    vi.stubGlobal("fetch", (input: RequestInfo) => {
      calls.push(String(input));
      if (calls.length === 1) {
        return Promise.resolve(new Response(JSON.stringify({ lines }), { status: 200 }));
      }
      return new Promise<Response>(() => {
        /* never settles */
      });
    });
    await mount();
    await act(async () => {
      fireEvent.click(screen.getByTestId("docker-logs-refresh"));
    });
    expect(shown()).toHaveLength(4);
  });

  it("AC-5 — a failed refresh keeps the old lines and says the re-read failed", async () => {
    vi.stubGlobal("fetch", (input: RequestInfo) => {
      calls.push(String(input));
      if (calls.length === 1) {
        return Promise.resolve(new Response(JSON.stringify({ lines }), { status: 200 }));
      }
      return Promise.reject(new Error("network"));
    });
    await mount();
    expect(shown()).toHaveLength(4);

    await act(async () => {
      fireEvent.click(screen.getByTestId("docker-logs-refresh"));
    });

    // Both facts, rendered separately.
    expect(shown()).toHaveLength(4);
    expect(screen.getByTestId("docker-logs-stale").textContent).toContain("Could not re-read");
    // NOT the empty state: "this container has written nothing" would be a
    // different and false claim.
    expect(screen.queryByTestId("docker-logs-empty")).toBeNull();
  });

  it("AC-5 — CONTROL: a refresh that succeeds clears the failure sentence", async () => {
    let failNext = true;
    vi.stubGlobal("fetch", (input: RequestInfo) => {
      calls.push(String(input));
      if (calls.length > 1 && failNext) {
        failNext = false;
        return Promise.reject(new Error("network"));
      }
      return Promise.resolve(new Response(JSON.stringify({ lines }), { status: 200 }));
    });
    await mount();
    await act(async () => {
      fireEvent.click(screen.getByTestId("docker-logs-refresh"));
    });
    expect(screen.getByTestId("docker-logs-stale")).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByTestId("docker-logs-refresh"));
    });
    expect(screen.queryByTestId("docker-logs-stale")).toBeNull();
  });

  it("AC-5 — a FIRST read that fails is still the empty state, not a stale one", async () => {
    vi.stubGlobal("fetch", (input: RequestInfo) => {
      calls.push(String(input));
      return Promise.reject(new Error("network"));
    });
    await mount();
    expect(screen.queryByTestId("docker-logs-stale")).toBeNull();
    expect(screen.getByTestId("docker-logs-empty")).toBeTruthy();
  });

  it("AC-6 — the control is present and works in fullscreen", async () => {
    await mount();
    await act(async () => {
      fireEvent.click(screen.getByTestId("docker-logs-fullscreen"));
    });
    expect(screen.getByTestId("docker-logs-overlay")).toBeTruthy();
    const inOverlay = screen
      .getByTestId("docker-logs-overlay")
      .querySelector("[data-testid='docker-logs-refresh']");
    expect(inOverlay).toBeTruthy();

    await act(async () => {
      fireEvent.click(inOverlay as HTMLElement);
    });
    expect(logCalls()).toHaveLength(2);
    // Still fullscreen afterwards — a refresh that dropped the overlay would
    // send the reader back to a 288px box mid-read.
    expect(screen.getByTestId("docker-logs-overlay")).toBeTruthy();
  });
});
