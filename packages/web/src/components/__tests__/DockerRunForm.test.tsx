// TASK-1874 AC-6 — creating a container is confirmed, and the confirmation
// names every port, because a port opens a socket on the machine.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { DockerRunForm } from "../DockerRunForm";
import type { DockerImage } from "../../api";

const calls: { url: string; method: string; body: string | null }[] = [];
let status = 201;
let body: unknown = { id: "new1", name: "scratch", state: "running" };
const done = vi.fn();
const cancel = vi.fn();

const IMAGE: DockerImage = {
  id: "img111",
  repository: "postgres",
  tag: "16",
  size: "420MB",
  createdAt: "2026-09-04",
  inUseBy: [],
};

beforeEach(() => {
  calls.length = 0;
  status = 201;
  body = { id: "new1", name: "scratch", state: "running" };
  done.mockReset();
  cancel.mockReset();
  vi.stubGlobal("fetch", (input: RequestInfo, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? init.body : null,
    });
    return Promise.resolve(new Response(JSON.stringify(body), { status }));
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const mount = (): void => {
  render(<DockerRunForm image={IMAGE} onDone={done} onCancel={cancel} />);
};

const fill = (name: string, host = "", container = ""): void => {
  fireEvent.change(screen.getByTestId("run-name"), { target: { value: name } });
  fireEvent.change(screen.getByTestId("run-host-port"), { target: { value: host } });
  fireEvent.change(screen.getByTestId("run-container-port"), { target: { value: container } });
};

describe("AC-6 — it asks, and the question names the ports", () => {
  it("submitting opens a confirmation and issues nothing", () => {
    mount();
    fill("scratch-pg", "5433", "5432");
    fireEvent.click(screen.getByTestId("run-submit"));

    const confirm = screen.getByTestId("run-confirm");
    expect(confirm.textContent).toContain("scratch-pg");
    expect(confirm.textContent).toContain("postgres:16");
    // The ports are the part with a consequence: they open a socket on the
    // machine. A confirmation that omits them hides the whole risk.
    expect(screen.getByTestId("run-confirm-ports").textContent).toContain("5433:5432");
    expect(calls).toHaveLength(0);
  });

  it("says so explicitly when no port is published", () => {
    mount();
    fill("quiet");
    fireEvent.click(screen.getByTestId("run-submit"));
    // "no ports" and "the ports were forgotten" must not look the same.
    expect(screen.getByTestId("run-confirm-noports")).toBeTruthy();
  });

  it("cancelling the confirmation issues nothing", () => {
    mount();
    fill("scratch-pg", "5433", "5432");
    fireEvent.click(screen.getByTestId("run-submit"));
    fireEvent.click(screen.getByTestId("run-confirm-cancel"));
    expect(calls).toHaveLength(0);
    expect(screen.queryByTestId("run-confirm")).toBeNull();
  });

  it("CONTROL — confirming posts exactly one body with the three allowed fields", async () => {
    mount();
    fill("scratch-pg", "5433", "5432");
    fireEvent.click(screen.getByTestId("run-submit"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("run-confirm-go"));
    });

    expect(calls).toHaveLength(1);
    const sent = JSON.parse(calls[0].body ?? "{}") as Record<string, unknown>;
    expect(sent).toEqual({
      imageId: "img111",
      name: "scratch-pg",
      ports: [{ host: 5433, container: 5432 }],
    });
    // Asserted with toEqual, so a volumes field appearing here would fail —
    // the client must not send what the route would refuse.
    expect(Object.keys(sent).sort()).toEqual(["imageId", "name", "ports"]);
  });
});

describe("the reader is told the rules before the round trip", () => {
  it("refuses to submit a name docker would reject, and says why", () => {
    mount();
    fill("has space");
    expect((screen.getByTestId("run-submit") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId("run-name-invalid").textContent).toContain("63 characters");
  });

  it("refuses a port out of range on either side", () => {
    mount();
    fill("ok-name", "70000", "5432");
    expect((screen.getByTestId("run-submit") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId("run-port-invalid")).toBeTruthy();

    fill("ok-name", "5433", "0");
    expect((screen.getByTestId("run-submit") as HTMLButtonElement).disabled).toBe(true);
  });

  it("CONTROL — a legal name and port enable the control", () => {
    // Without this, "disabled" could come from a button that is always disabled.
    mount();
    fill("ok-name", "1", "65535");
    expect((screen.getByTestId("run-submit") as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("AC-7 — what comes back is what is reported", () => {
  it("passes the daemon's state up, even when it is not running", async () => {
    // An image whose command exits at once is already gone by the time the
    // request returns. Saying "running" because it returned 201 would be the
    // UI narrating its own intent.
    body = { id: "new1", name: "flash", state: "exited" };
    mount();
    fill("flash");
    fireEvent.click(screen.getByTestId("run-submit"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("run-confirm-go"));
    });
    expect(done).toHaveBeenCalledWith("flash is exited.");
  });

  it("a taken name is reported without closing the form", async () => {
    status = 409;
    body = { error: "name taken" };
    mount();
    fill("existing-one");
    fireEvent.click(screen.getByTestId("run-submit"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("run-confirm-go"));
    });
    expect(screen.getByTestId("run-error").textContent).toContain("already exists");
    // The form stays open so the name can be changed rather than retyped.
    expect(screen.getByTestId("run-form")).toBeTruthy();
    expect(done).not.toHaveBeenCalled();
  });
});
