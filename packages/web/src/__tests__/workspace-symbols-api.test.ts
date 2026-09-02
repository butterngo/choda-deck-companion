// TASK-1799 — the two 404s are told apart HERE, in the fetch layer, so this is
// where the discrimination has to be proven. A component test can only show
// that the panel renders whatever flag it was handed.
//
// The separation rests on an error STRING, which is the fragile part of the
// whole feature: `/healthz` carries no capability list, so an adapter that
// predates the route is indistinguishable from one that knows the route but
// not the workspace, except by what the body says (INBOX-1897).

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  AdapterRouteMissingError,
  fetchWorkspaceSymbols,
  UnknownWorkspaceError,
} from "../api";

function respond(status: number, body: unknown): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    })) as unknown as typeof fetch,
  );
}

/** A 404 whose body is not JSON at all — an adapter old enough to be surprising. */
function respondUnparseable(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: false,
      status: 404,
      json: async () => {
        throw new SyntaxError("Unexpected token < in JSON");
      },
    })) as unknown as typeof fetch,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchWorkspaceSymbols", () => {
  it("returns the payload on 200", async () => {
    respond(200, {
      workspaceId: "main",
      cwd: "C:/dev/x",
      name: "Foo",
      matches: [{ path: "src/foo.ts", line: 3, kind: "class", text: "class Foo {}" }],
    });
    const res = await fetchWorkspaceSymbols("main", "Foo");
    expect(res.matches).toHaveLength(1);
    expect(res.matches[0]?.line).toBe(3);
  });

  it("treats an empty match array as a normal answer, not a failure", async () => {
    respond(200, { workspaceId: "main", cwd: "C:/dev/x", name: "Nope", matches: [] });
    await expect(fetchWorkspaceSymbols("main", "Nope")).resolves.toMatchObject({ matches: [] });
  });

  // AC-4's mechanism
  it("reads the router's default 404 as an adapter that lacks the route", async () => {
    respond(404, { error: "not found" });
    await expect(fetchWorkspaceSymbols("main", "Foo")).rejects.toBeInstanceOf(
      AdapterRouteMissingError,
    );
  });

  // AC-5's mechanism — same status, different body, different meaning.
  it("reads a named-workspace 404 as an unknown workspace", async () => {
    respond(404, { error: "unknown workspace: ghost" });
    const err = await fetchWorkspaceSymbols("ghost", "Foo").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UnknownWorkspaceError);
    expect(err).not.toBeInstanceOf(AdapterRouteMissingError);
    expect((err as UnknownWorkspaceError).workspaceId).toBe("ghost");
  });

  it("falls back to the outdated-adapter reading when the 404 body cannot be parsed", async () => {
    // An adapter old enough to lack the route may answer with anything at all;
    // a parse failure must not become a crash stacked on top of a 404.
    respondUnparseable();
    await expect(fetchWorkspaceSymbols("main", "Foo")).rejects.toBeInstanceOf(
      AdapterRouteMissingError,
    );
  });

  it("leaves any other failure as a plain error", async () => {
    respond(500, { error: "boom" });
    const err = await fetchWorkspaceSymbols("main", "Foo").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(AdapterRouteMissingError);
    expect(err).not.toBeInstanceOf(UnknownWorkspaceError);
  });
});
