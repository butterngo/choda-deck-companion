// TASK-1873 AC-6 and AC-7 — removal is confirmed, and the list is re-read.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { DockerImages } from "../DockerImages";

const calls: { url: string; method: string }[] = [];
let listStatus = 200;
let listBody: unknown = { images: [] };
let removeStatus = 200;
let removeBody: unknown = { id: "x", freed: "12MB" };
let pruneBody: unknown = { removed: 0, freed: "0B" };
/** Lets a test change what the second list read returns. */
let onList: (() => void) | null = null;

const image = (
  id: string,
  repository: string,
  tag = "latest",
  inUseBy: string[] = [],
  size = "421MB",
): Record<string, unknown> => ({ id, repository, tag, size, createdAt: "2026-09-04", inUseBy });

beforeEach(() => {
  calls.length = 0;
  listStatus = 200;
  listBody = { images: [] };
  removeStatus = 200;
  removeBody = { id: "x", freed: "12MB" };
  pruneBody = { removed: 0, freed: "0B" };
  onList = null;
  vi.stubGlobal("fetch", (input: RequestInfo, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ url, method });
    if (url.endsWith("/docker/images/prune")) {
      return Promise.resolve(new Response(JSON.stringify(pruneBody), { status: 200 }));
    }
    if (method === "DELETE") {
      return Promise.resolve(new Response(JSON.stringify(removeBody), { status: removeStatus }));
    }
    onList?.();
    return Promise.resolve(new Response(JSON.stringify(listBody), { status: listStatus }));
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const mount = async (): Promise<void> => {
  render(<DockerImages />);
  await act(async () => {
    await Promise.resolve();
  });
};

const writes = (): typeof calls => calls.filter((c) => c.method !== "GET");
const lists = (): typeof calls => calls.filter((c) => c.method === "GET");

describe("AC-6 — removal is confirmed, and the confirmation says what it costs", () => {
  it("pressing Remove asks, names the image and its size, and issues nothing", async () => {
    listBody = { images: [image("aaa", "unused-thing", "1.0", [], "12MB")] };
    await mount();
    fireEvent.click(screen.getByTestId("image-remove-aaa"));

    const confirm = screen.getByTestId("images-confirm");
    expect(confirm.textContent).toContain("unused-thing:1.0");
    // The size is what the reader is doing this for, and what they lose if they
    // are wrong about it.
    expect(confirm.textContent).toContain("12MB");
    expect(confirm.textContent).toContain("Rebuilding it is the only way back");
    expect(writes()).toHaveLength(0);
  });

  it("cancelling issues nothing", async () => {
    listBody = { images: [image("aaa", "unused-thing")] };
    await mount();
    fireEvent.click(screen.getByTestId("image-remove-aaa"));
    fireEvent.click(screen.getByTestId("images-confirm-cancel"));
    expect(writes()).toHaveLength(0);
    expect(screen.queryByTestId("images-confirm")).toBeNull();
  });

  it("CONTROL — confirming issues exactly one DELETE for that image", async () => {
    listBody = { images: [image("aaa", "unused-thing")] };
    await mount();
    fireEvent.click(screen.getByTestId("image-remove-aaa"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("images-confirm-go"));
    });
    expect(writes()).toHaveLength(1);
    expect(writes()[0].method).toBe("DELETE");
    expect(writes()[0].url).toContain("/docker/images/aaa");
  });
});

describe("an image a container holds is not offered for removal", () => {
  it("shows the holders instead of a button", async () => {
    listBody = {
      images: [image("held", "postgres", "16", ["chatengine-db", "insfrastrucure-postgres-1"])],
    };
    await mount();
    // Offering a button the adapter is going to refuse is worse than offering
    // none, and the reason belongs on the row rather than behind a click.
    expect(screen.queryByTestId("image-remove-held")).toBeNull();
    expect(screen.getByTestId("image-held-held").textContent).toContain("chatengine-db");
    expect(screen.getByTestId("image-row-held").getAttribute("data-inuse")).toBe("true");
  });

  it("CONTROL — an unused image does get a button", async () => {
    listBody = { images: [image("free", "unused-thing")] };
    await mount();
    expect(screen.getByTestId("image-remove-free")).toBeTruthy();
    expect(screen.getByTestId("image-row-free").getAttribute("data-inuse")).toBe("false");
  });

  it("the count says how many are actually removable", async () => {
    listBody = {
      images: [image("a", "x", "1", ["c1"]), image("b", "y", "1"), image("c", "z", "1")],
    };
    await mount();
    expect(screen.getByTestId("images-verdict").textContent).toContain("3 images");
    expect(screen.getByTestId("images-verdict").textContent).toContain("2 removable");
  });
});

describe("AC-7 — the list is re-read from the daemon, not patched locally", () => {
  it("issues a second GET after a removal and renders what it returns", async () => {
    listBody = { images: [image("aaa", "unused-thing")] };
    await mount();
    expect(lists()).toHaveLength(1);

    // The daemon's view after the removal: the image is gone AND another one
    // appeared, which a local splice could never produce.
    onList = () => {
      listBody = { images: [image("bbb", "something-else")] };
    };
    fireEvent.click(screen.getByTestId("image-remove-aaa"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("images-confirm-go"));
    });

    expect(lists()).toHaveLength(2);
    expect(screen.queryByTestId("image-row-aaa")).toBeNull();
    // This is the discriminator: dropping the row locally would leave the new
    // image invisible, and a removal that partially failed would look clean.
    expect(screen.getByTestId("image-row-bbb")).toBeTruthy();
  });

  it("a 409 says which containers hold it and leaves the row alone", async () => {
    listBody = { images: [image("aaa", "unused-thing")] };
    removeStatus = 409;
    removeBody = { error: "in use", by: ["jm-api"] };
    await mount();
    fireEvent.click(screen.getByTestId("image-remove-aaa"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("images-confirm-go"));
    });
    expect(screen.getByTestId("images-note").textContent).toContain("jm-api");
    expect(screen.getByTestId("image-row-aaa")).toBeTruthy();
  });
});

describe("AC-8 — prune says what it did, including nothing", () => {
  it("asks first, then reports the count and the space", async () => {
    listBody = { images: [image("aaa", "unused-thing")] };
    pruneBody = { removed: 3, freed: "1.2GB" };
    await mount();

    fireEvent.click(screen.getByTestId("images-prune"));
    expect(writes()).toHaveLength(0);

    await act(async () => {
      fireEvent.click(screen.getByTestId("images-prune-go"));
    });
    expect(screen.getByTestId("images-note").textContent).toContain("Pruned 3");
    expect(screen.getByTestId("images-note").textContent).toContain("1.2GB");
  });

  it("zero is stated rather than passing silently", async () => {
    listBody = { images: [image("aaa", "unused-thing")] };
    pruneBody = { removed: 0, freed: "0B" };
    await mount();
    fireEvent.click(screen.getByTestId("images-prune"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("images-prune-go"));
    });
    // A silent success is indistinguishable from a prune that did nothing.
    expect(screen.getByTestId("images-note").textContent).toContain("Nothing to prune");
  });
});

describe("the states that must not look alike", () => {
  it("no daemon is a capability note", async () => {
    listStatus = 501;
    listBody = { error: "docker not available" };
    await mount();
    expect(screen.getByTestId("images-unavailable")).toBeTruthy();
  });

  it("no images at all says so", async () => {
    listBody = { images: [] };
    await mount();
    expect(screen.getByTestId("images-none")).toBeTruthy();
  });
});
