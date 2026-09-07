// TASK-1875 AC-7 — browsing costs one request per navigation, and every empty
// state says which empty it is.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { ContainerFiles } from "../ContainerFiles";

const calls: string[] = [];
let lsStatus = 200;
let lsBody: unknown = { entries: [] };
let catStatus = 200;
let catBody: unknown = { text: "" };

const entry = (
  name: string,
  mode = "-rw-r--r--",
  owner = "node",
  group = "staff",
  size = "1234",
): Record<string, unknown> => ({
  raw: `${mode}  1 ${owner}  ${group}   ${size} Sep  4 10:18 ${name}`,
  name,
  mode,
  owner,
  group,
  size,
});

beforeEach(() => {
  calls.length = 0;
  lsStatus = 200;
  lsBody = { entries: [] };
  catStatus = 200;
  catBody = { text: "" };
  vi.stubGlobal("fetch", (input: RequestInfo) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("/docker/exec/cat")) {
      return Promise.resolve(new Response(JSON.stringify(catBody), { status: catStatus }));
    }
    return Promise.resolve(new Response(JSON.stringify(lsBody), { status: lsStatus }));
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const mount = async (): Promise<void> => {
  render(<ContainerFiles containerId="run1" containerName="jm-api" />);
  await act(async () => {
    await Promise.resolve();
  });
};

const lsCalls = (): string[] => calls.filter((u) => u.includes("/docker/exec/ls"));

describe("AC-7 — one request per navigation, and no more", () => {
  it("reads once on mount, at the root", async () => {
    await mount();
    expect(lsCalls()).toHaveLength(1);
    expect(lsCalls()[0]).toContain(`path=${encodeURIComponent("/")}`);
    expect(screen.getByTestId("cf-path").textContent).toBe("/");
  });

  it("entering a directory reads exactly once more, at the joined path", async () => {
    lsBody = { entries: [entry("app", "drwxr-xr-x", "1000", "1000", "4096")] };
    await mount();
    await act(async () => {
      fireEvent.click(screen.getByTestId("cf-row-app").querySelector("button")!);
    });
    expect(lsCalls()).toHaveLength(2);
    expect(lsCalls()[1]).toContain(encodeURIComponent("/app"));
  });

  it("Up goes back to the parent, not to the root every time", async () => {
    lsBody = { entries: [entry("app", "drwxr-xr-x")] };
    await mount();
    // Seeded BEFORE the click: the effect refetches on the path change, so a
    // body set afterwards would arrive too late to be listed.
    lsBody = { entries: [entry("src", "drwxr-xr-x")] };
    await act(async () => {
      fireEvent.click(screen.getByTestId("cf-row-app").querySelector("button")!);
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("cf-row-src").querySelector("button")!);
    });
    expect(screen.getByTestId("cf-path").textContent).toBe("/app/src");

    await act(async () => {
      fireEvent.click(screen.getByTestId("cf-up"));
    });
    // A parent that always returns "/" would pass a one-level test.
    expect(screen.getByTestId("cf-path").textContent).toBe("/app");
  });
});

describe("the states that must not look alike", () => {
  it("an empty directory says so", async () => {
    lsBody = { entries: [] };
    await mount();
    expect(screen.getByTestId("cf-empty")).toBeTruthy();
  });

  it("a path that is not there says something different", async () => {
    lsStatus = 422;
    lsBody = { error: "no such path: /nope" };
    await mount();
    // "empty" and "not there" are different facts.
    expect(screen.getByTestId("cf-error")).toBeTruthy();
    expect(screen.queryByTestId("cf-empty")).toBeNull();
  });
});

describe("AC-1 at the surface — uid and gid are what a reader came for", () => {
  it("renders owner:group and the mode for a parsed row", async () => {
    lsBody = { entries: [entry("package.json", "-rw-r--r--", "1000", "1000", "1234")] };
    await mount();
    // Butter asked for gid specifically; this is where it shows.
    expect(screen.getByTestId("cf-owner-package.json").textContent).toBe("1000:1000");
  });

  it("a row the parser could not read falls back to its raw line", async () => {
    lsBody = {
      entries: [{ raw: "some unrecognised ls dialect", name: "weird", mode: "", owner: "", group: "", size: "" }],
    };
    await mount();
    // Three blank columns would hide a file that is really there.
    expect(screen.getByTestId("cf-raw-weird").textContent).toBe("some unrecognised ls dialect");
    expect(screen.queryByTestId("cf-owner-weird")).toBeNull();
  });
});

describe("reading a file, and refusing to pretend", () => {
  it("opens a file and shows its text", async () => {
    lsBody = { entries: [entry("a.json")] };
    catBody = { text: '{"a":1}' };
    await mount();
    await act(async () => {
      fireEvent.click(screen.getByTestId("cf-row-a.json").querySelector("button")!);
    });
    expect(screen.getByTestId("cf-file").textContent).toContain('{"a":1}');
  });

  it("too large and not text are stated differently", async () => {
    lsBody = { entries: [entry("big.bin")] };
    catStatus = 413;
    catBody = { error: "file too large" };
    await mount();
    await act(async () => {
      fireEvent.click(screen.getByTestId("cf-row-big.bin").querySelector("button")!);
    });
    const tooBig = screen.getByTestId("cf-file-error").textContent ?? "";

    catStatus = 415;
    catBody = { error: "not text" };
    await act(async () => {
      fireEvent.click(screen.getByTestId("cf-row-big.bin").querySelector("button")!);
    });
    const notText = screen.getByTestId("cf-file-error").textContent ?? "";

    // Neither is a failure of the app, and they are different facts — one is
    // about size, the other about content.
    expect(tooBig).not.toBe(notText);
    expect(tooBig).toContain("too big");
    expect(notText).toContain("not text");
    // And neither renders a body pretending to be the file.
    expect(screen.queryByTestId("cf-file")).toBeNull();
  });
});

// TASK-1899 — a real directory does not fit in a 288px box.
describe("TASK-1899 — the Files pane goes fullscreen", () => {
  const closed = vi.fn();
  const mountWithClose = async (): Promise<void> => {
    closed.mockClear();
    render(<ContainerFiles containerId="run1" containerName="jm-api" onClose={closed} />);
    await act(async () => {
      await Promise.resolve();
    });
  };
  const enter = async (): Promise<void> => {
    await act(async () => {
      fireEvent.click(screen.getByTestId("cf-fullscreen"));
    });
  };

  it("AC-1 — the control opens an overlay, and closing returns to the inline pane", async () => {
    lsBody = { entries: [entry("package.json")] };
    await mountWithClose();
    expect(screen.queryByTestId("cf-overlay")).toBeNull();

    await enter();
    expect(screen.getByTestId("cf-overlay")).toBeTruthy();
    // The listing came with it — an overlay that renders an empty box is not
    // fullscreen, it is a second pane.
    expect(screen.getByTestId("cf-overlay").textContent).toContain("package.json");

    await enter();
    expect(screen.queryByTestId("cf-overlay")).toBeNull();
    expect(screen.getByTestId("container-files")).toBeTruthy();
  });

  it("AC-2 — Escape leaves fullscreen and leaves the PANE open", async () => {
    lsBody = { entries: [entry("package.json")] };
    await mountWithClose();
    await enter();

    await act(async () => {
      fireEvent.keyDown(document, { key: "Escape" });
    });

    // Two different exits. Escape is not Close, and conflating them would take
    // the pane away from a reader who only wanted the overlay gone.
    expect(screen.queryByTestId("cf-overlay")).toBeNull();
    expect(screen.getByTestId("container-files")).toBeTruthy();
    expect(closed).not.toHaveBeenCalled();
  });

  it("AC-3 — fullscreen gives the listing and the file MORE room", async () => {
    lsBody = { entries: [entry("package.json")] };
    catBody = { text: '{"a":1}' };
    await mountWithClose();
    await act(async () => {
      fireEvent.click(screen.getByTestId("cf-row-package.json").querySelector("button")!);
    });
    const inlineList = screen.getByTestId("cf-list").className;
    const inlineFile = screen.getByTestId("cf-file-body").className;

    await enter();

    // Asserted as a DIFFERENCE, not as a class name: an overlay that kept
    // max-h-72 would satisfy AC-1 while showing exactly as much as before.
    expect(screen.getByTestId("cf-list").className).not.toBe(inlineList);
    expect(screen.getByTestId("cf-file-body").className).not.toBe(inlineFile);
    expect(inlineList).toContain("max-h-72");
    expect(screen.getByTestId("cf-list").className).not.toContain("max-h-72");
  });

  it("AC-4 — path, entries and the open file survive the toggle, with no new request", async () => {
    lsBody = { entries: [entry("app", "drwxr-xr-x"), entry("package.json")] };
    await mountWithClose();
    // Swapped BEFORE the click: the listing effect fires inside it, so setting
    // the next body afterwards would serve the old one.
    lsBody = { entries: [entry("index.ts")] };
    await act(async () => {
      fireEvent.click(screen.getByTestId("cf-row-app").querySelector("button")!);
    });
    catBody = { text: "export const x = 1" };
    await act(async () => {
      fireEvent.click(screen.getByTestId("cf-row-index.ts").querySelector("button")!);
    });
    const before = lsCalls().length;
    expect(screen.getByTestId("cf-path").textContent).toBe("/app");

    await enter();

    expect(screen.getByTestId("cf-path").textContent).toBe("/app");
    expect(screen.getByTestId("cf-row-index.ts")).toBeTruthy();
    expect(screen.getByTestId("cf-file").textContent).toContain("export const x = 1");
    // Going fullscreen is a CSS change, not a re-read. A toggle that refetched
    // would shell out to docker for a layout.
    expect(lsCalls()).toHaveLength(before);

    await enter();
    expect(screen.getByTestId("cf-path").textContent).toBe("/app");
    expect(screen.getByTestId("cf-file").textContent).toContain("export const x = 1");
    expect(lsCalls()).toHaveLength(before);
  });

  it("AC-5 — you can still walk into a directory and open a file from the overlay", async () => {
    lsBody = { entries: [entry("app", "drwxr-xr-x")] };
    await mountWithClose();
    await enter();

    lsBody = { entries: [entry("index.ts")] };
    await act(async () => {
      fireEvent.click(screen.getByTestId("cf-row-app").querySelector("button")!);
    });
    expect(screen.getByTestId("cf-path").textContent).toBe("/app");
    expect(screen.getByTestId("cf-overlay").textContent).toContain("index.ts");

    catBody = { text: "hello" };
    await act(async () => {
      fireEvent.click(screen.getByTestId("cf-row-index.ts").querySelector("button")!);
    });
    expect(screen.getByTestId("cf-file").textContent).toContain("hello");
    // Still fullscreen — navigating must not drop the reader back to the box
    // they left.
    expect(screen.getByTestId("cf-overlay")).toBeTruthy();
  });

  it("AC-6 — Escape returns focus to the fullscreen button", async () => {
    lsBody = { entries: [entry("package.json")] };
    await mountWithClose();
    await enter();
    await act(async () => {
      fireEvent.keyDown(document, { key: "Escape" });
    });
    expect(document.activeElement).toBe(screen.getByTestId("cf-fullscreen"));
  });

  it("AC-6 — Close is reachable in fullscreen and dismisses the PANE", async () => {
    lsBody = { entries: [entry("package.json")] };
    await mountWithClose();
    await enter();
    const inOverlay = screen
      .getByTestId("cf-overlay")
      .querySelector("[data-testid='cf-close']");
    expect(inOverlay).toBeTruthy();

    await act(async () => {
      fireEvent.click(inOverlay as HTMLElement);
    });
    // The pane's own removal belongs to the parent (TASK-1896); what this owns
    // is telling it, which is what the spy proves.
    expect(closed).toHaveBeenCalledTimes(1);
  });
});
