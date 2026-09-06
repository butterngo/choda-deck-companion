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
