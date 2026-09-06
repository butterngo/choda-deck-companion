// TASK-1879 — every frame the component sends is recorded and asserted by
// CONTENT, not by count. "A size frame was sent" is true of a component that
// hardcodes 80x24, which is exactly the failure AC-2 names.
//
// xterm and its fit addon are MOCKED here, and that is a deliberate boundary
// rather than convenience. jsdom has no canvas, so the real xterm cannot
// measure a character cell: proposeDimensions() returns its 80x24 default
// whatever the pane is, and the renderer paints nothing a test can read.
// Asserting against that would be theatre — it would pass equally well against
// a component that hardcodes the very numbers this AC forbids.
//
// So the fake reports a distinctive grid, and the tests assert those exact
// numbers arrive in the frame. What is being proven is what this component
// owns: that it forwards a MEASURED size rather than a constant, routes `out`
// into the terminal, and stops accepting input when the shell dies. Whether
// xterm draws correctly is xterm's business, and AC-7 is where a human checks
// it against a real shell.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act, cleanup, fireEvent } from "@testing-library/react";

/** What the fake fit addon will report. Deliberately not 80x24. */
let proposed: { cols: number; rows: number } | undefined = { cols: 137, rows: 41 };

interface FakeTerm {
  written: string[];
  options: { disableStdin?: boolean };
  emitData: (d: string) => void;
  disposed: boolean;
}
let terms: FakeTerm[] = [];

vi.mock("@xterm/xterm", () => {
  class Terminal {
    written: string[] = [];
    options: { disableStdin?: boolean } = {};
    cols = 80;
    rows = 24;
    disposed = false;
    private dataCb: ((d: string) => void) | null = null;
    constructor() {
      terms.push(this as unknown as FakeTerm);
    }
    loadAddon(): void {}
    open(): void {}
    write(d: string): void {
      this.written.push(d);
    }
    onData(cb: (d: string) => void): { dispose: () => void } {
      this.dataCb = cb;
      return { dispose: () => (this.dataCb = null) };
    }
    /** Stand in for a keypress reaching xterm. */
    emitData(d: string): void {
      this.dataCb?.(d);
    }
    dispose(): void {
      this.disposed = true;
    }
  }
  return { Terminal };
});

vi.mock("@xterm/addon-fit", () => {
  class FitAddon {
    fit(): void {}
    proposeDimensions(): { cols: number; rows: number } | undefined {
      return proposed;
    }
  }
  return { FitAddon };
});

vi.mock("@xterm/xterm/css/xterm.css", () => ({}));

import { WorkspaceTerminal } from "../WorkspaceTerminal";

interface Sent {
  t: string;
  [k: string]: unknown;
}

class FakeSocket {
  static last: FakeSocket | null = null;
  readyState = 0;
  sent: Sent[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(public url: string) {
    FakeSocket.last = this;
  }
  send(raw: string): void {
    this.sent.push(JSON.parse(raw) as Sent);
  }
  close(): void {
    this.closed = true;
  }
  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }
  deliver(frame: Record<string, unknown>): void {
    this.onmessage?.({ data: JSON.stringify(frame) } as MessageEvent);
  }
  framesOf(t: string): Sent[] {
    return this.sent.filter((f) => f.t === t);
  }
}

const factory = (url: string): WebSocket => new FakeSocket(url) as unknown as WebSocket;
const sock = (): FakeSocket => {
  if (!FakeSocket.last) throw new Error("no socket was created");
  return FakeSocket.last;
};
const term = (): FakeTerm => {
  const t = terms.at(-1);
  if (!t) throw new Error("no terminal was created");
  return t;
};

beforeEach(() => {
  FakeSocket.last = null;
  terms = [];
  proposed = { cols: 137, rows: 41 };
});

afterEach(() => {
  cleanup();
});

const mount = (cwd = "C:\\dev\\choda-deck"): ReturnType<typeof render> =>
  render(<WorkspaceTerminal cwd={cwd} label="choda-deck" socketFactory={factory} />);

const opened = async (): Promise<void> => {
  await act(async () => {
    sock().open();
  });
};

// ---------------------------------------------------------------------------

describe("AC-2 — the size that is sent is the size that was measured", () => {
  it("start carries the cwd and the MEASURED grid", async () => {
    mount();
    await opened();
    const start = sock().framesOf("start")[0];
    expect(start).toBeDefined();
    expect(start.cwd).toBe("C:\\dev\\choda-deck");
    // The discriminator: a component sending a fixed 80x24 passes "a start
    // frame was sent" and fails this outright.
    expect(start.cols).toBe(137);
    expect(start.rows).toBe(41);
  });

  it("a resize sends a size frame carrying the NEW numbers", async () => {
    mount();
    await opened();
    proposed = { cols: 200, rows: 60 };
    await act(async () => {
      window.dispatchEvent(new Event("resize"));
    });
    const size = sock().framesOf("size").at(-1);
    // Asserting only that a frame arrived would pass against a component that
    // resends its original grid forever.
    expect(size?.cols).toBe(200);
    expect(size?.rows).toBe(60);
  });

  it("falls back to the terminal's own grid when nothing can be measured", async () => {
    proposed = undefined;
    mount();
    await opened();
    const start = sock().framesOf("start")[0];
    // A pane with no size yet must still start a shell, not send NaN.
    expect(typeof start.cols).toBe("number");
    expect(Number.isNaN(start.cols)).toBe(false);
  });
});

describe("AC-1 — a keystroke is a frame, not a line", () => {
  it("sends ONE in frame per keystroke, carrying exactly the data", async () => {
    mount();
    await opened();
    await act(async () => {
      term().emitData("l");
      term().emitData("s");
      term().emitData("\r");
    });
    const ins = sock().framesOf("in");
    // Three keystrokes, three frames, in order and unaltered. Line buffering —
    // the failure this names — would produce ONE frame carrying "ls\r", which
    // breaks every interactive program.
    expect(ins.map((f) => f.d)).toEqual(["l", "s", "\r"]);
  });

  it("writes an out frame's payload into the terminal, byte for byte", async () => {
    mount();
    await opened();
    await act(async () => {
      sock().deliver({ t: "ready", cols: 137, rows: 41 });
      sock().deliver({ t: "out", d: "hello \x1b[31mred\x1b[0m" });
    });
    // Byte for byte: escape sequences ARE the output. A component that
    // sanitised or split them would render a terminal that cannot colour.
    expect(term().written).toContain("hello \x1b[31mred\x1b[0m");
  });
});

describe("AC-5 — early keystrokes are held, not dropped", () => {
  it("sends nothing before the socket opens, then flushes in order after start", async () => {
    mount();
    await act(async () => {
      term().emitData("a");
      term().emitData("b");
    });
    // Nothing may cross a socket that is not open.
    expect(sock().sent).toEqual([]);

    await opened();
    const kinds = sock().sent.map((f) => f.t);
    // start is always first...
    expect(kinds[0]).toBe("start");
    // ...and the held keystrokes follow, in the order they were typed. Dropping
    // them reads as a broken keyboard; reordering them is worse.
    expect(sock().framesOf("in").map((f) => f.d)).toEqual(["a", "b"]);
  });
});

describe("AC-3 — a dead shell says so and stops taking input", () => {
  it("states the exit code and disables the terminal's input", async () => {
    mount();
    await opened();
    await act(async () => {
      sock().deliver({ t: "exit", code: 3 });
    });
    expect(screen.getByTestId("term-exited").textContent).toContain("code 3");
    // Not merely a message: silently ACCEPTING typing into a dead shell is the
    // failure, and a message alone does not prevent it.
    expect(term().options.disableStdin).toBe(true);
  });

  it("a live shell is NOT disabled — so the flag means something", async () => {
    mount();
    await opened();
    await act(async () => {
      sock().deliver({ t: "ready", cols: 137, rows: 41 });
    });
    expect(term().options.disableStdin).toBe(false);
  });

  it("offers a way to start again, on a NEW socket", async () => {
    mount();
    await opened();
    await act(async () => {
      sock().deliver({ t: "exit", code: 0 });
    });
    const first = sock();
    await act(async () => {
      fireEvent.click(screen.getByTestId("term-restart"));
    });
    // A dead socket reused would look identical until the first keystroke.
    expect(sock()).not.toBe(first);
    expect(first.closed).toBe(true);
  });
});

describe("AC-6 — an unreachable adapter is stated, not a black rectangle", () => {
  it("says what went wrong and offers a retry", async () => {
    mount();
    await act(async () => {
      sock().onerror?.();
    });
    expect(screen.getByTestId("term-failed").textContent).toContain("Could not reach");
    // A dead socket and a shell that has printed nothing are indistinguishable
    // INSIDE the terminal, which is exactly why this is said outside it.
    expect(screen.getByTestId("term-restart")).toBeTruthy();
  });

  it("a clean exit is NOT reported as a failure — two facts, two renderings", async () => {
    mount();
    await opened();
    await act(async () => {
      sock().deliver({ t: "exit", code: 0 });
      sock().onclose?.();
    });
    expect(screen.getByTestId("term-exited")).toBeTruthy();
    expect(screen.queryByTestId("term-failed")).toBeNull();
  });
});

describe("AC-4 — the socket does not outlive the view", () => {
  it("closes the socket and disposes the terminal on unmount", async () => {
    const r = mount();
    await opened();
    const s = sock();
    const t = term();
    expect(s.closed).toBe(false);
    r.unmount();
    // By TASK-1878 AC-3 the adapter kills the PTY when the socket closes; this
    // is the half that makes that fire. Left open, a shell is left behind.
    expect(s.closed).toBe(true);
    expect(t.disposed).toBe(true);
  });
});
