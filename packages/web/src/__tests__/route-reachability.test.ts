// TASK-1767 — the guard that would have caught INBOX-1875 on the day it was
// introduced, instead of three weeks and one release later.
//
// Two halves, and both are needed:
//   * fixture tests for the matcher, because a detector with false negatives is
//     worse than none — it invents phantom work and teaches people to ignore
//     the real hits. The throwaway version of this scan did exactly that.
//   * a live test over the REAL router and the REAL component tree, because a
//     matcher that only ever sees its own fixtures proves nothing about the app.

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  extractRoutes,
  extractLinkTargets,
  isReached,
  checkReachability,
} from "../route-reachability";

// Routes deliberately reachable only by deep link. Empty is the goal: every
// entry here is a route a user cannot click to, and needs a written reason.
const DEEP_LINK_ONLY: readonly string[] = [];

const SRC = path.resolve(__dirname, "..");

function readComponentSources(): string[] {
  const out: string[] = [];
  (function walk(dir: string): void {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== "__tests__") walk(p);
      } else if (/\.tsx?$/.test(p) && !p.endsWith("router.tsx")) {
        out.push(fs.readFileSync(p, "utf8"));
      }
    }
  })(SRC);
  return out;
}

describe("extractRoutes", () => {
  it("takes the route list FROM the router, never a hand-copied duplicate", () => {
    // A hand-maintained list would silently pass for a route someone forgot to
    // add to it — this bug wearing a different hat.
    const routes = extractRoutes(`
      { path: "sync", element: <SyncView /> },
      { path: "tasks/:id", element: <TaskDetailView /> },
    `);
    expect(routes).toEqual(["sync", "tasks/:id"]);
  });

  it("ignores the index and wildcard entries, which are not destinations", () => {
    expect(extractRoutes('{ path: "/", x }, { path: "*", y }, { path: "vault", z }')).toEqual([
      "vault",
    ]);
  });
});

// AC-4 — one fixture per link form actually used in this codebase. Each of
// these is a form the throwaway scan could have missed, and one it did.
describe("extractLinkTargets — every link form in use", () => {
  it("plain string: to=\"/projects\"", () => {
    expect(extractLinkTargets('<Link to="/projects">')).toContain("/projects");
  });

  it("template literal: to={`/tasks/${id}`} — the form the first scan could not see", () => {
    // The matcher keeps the raw text including the ${…} placeholder; what
    // matters is that the STATIC prefix survives, since that is what isReached
    // matches on.
    const targets = extractLinkTargets("<Link to={`/tasks/${encodeURIComponent(id)}`}>");
    expect(targets.some((t) => t.startsWith("/tasks/"))).toBe(true);
  });

  it("hash-prefixed raw anchor: href={`#/workspace-docs?…`}", () => {
    // A plain <a> in a hash-routed app carries the '#' that <Link> would add.
    const targets = extractLinkTargets("<a href={`#/workspace-docs?workspaceId=${id}`}>");
    // The leading '#' is stripped so it lands in the router's own vocabulary.
    expect(targets.some((t) => t.startsWith("/workspace-docs?"))).toBe(true);
  });

  // Control: the matcher must not treat every string as a link, or "reachable"
  // becomes meaningless and the guard can never fail.
  it("does NOT count external URLs or non-link attributes", () => {
    const targets = extractLinkTargets(
      '<a href="https://example.com"> <div className="/projects"> <img src="/logo.png">',
    );
    expect(targets).not.toContain("/projects");
    expect(targets).toEqual([]);
  });
});

describe("isReached", () => {
  it("matches a parameterised route by its static prefix", () => {
    expect(isReached("tasks/:id", ["/tasks/TASK-1"])).toBe(true);
    expect(isReached("tasks/:id", ["/tasks/"])).toBe(true);
  });

  it("matches a query-string link", () => {
    expect(isReached("workspace-docs", ["/workspace-docs?workspaceId=main"])).toBe(true);
  });

  // Control: a route with nothing pointing at it must report false, otherwise
  // the whole guard is a no-op that always passes.
  it("reports false when nothing points at the route", () => {
    expect(isReached("tasks/:id", ["/cockpit", "/projects"])).toBe(false);
  });

  it("does not let a longer route satisfy a different one by accident", () => {
    expect(isReached("workspaces/:id", ["/workspace-docs"])).toBe(false);
  });
});

describe("checkReachability over the REAL app", () => {
  const routerSource = fs.readFileSync(path.join(SRC, "router.tsx"), "utf8");

  it("every declared route has at least one in-app link", () => {
    const { routes, unreachable } = checkReachability(
      routerSource,
      readComponentSources(),
      DEEP_LINK_ONLY,
    );
    expect(routes.length).toBeGreaterThan(0); // guard against an empty scan passing vacuously
    expect(unreachable).toEqual([]);
  });

  it("catches a route whose only link is removed — the INBOX-1875 shape", () => {
    // Reproduces the released defect against the real router: /tasks/:id
    // declared, nothing linking to it. Uses the real route list so it cannot
    // drift from the app.
    const { unreachable } = checkReachability(
      routerSource,
      ['<Link to="/sync">', '<Link to="/projects">'],
      DEEP_LINK_ONLY,
    );
    expect(unreachable).toContain("tasks/:id");
    expect(unreachable).toContain("workspace-docs");
  });

  it("an allowlisted route is excused, and ONLY that one", () => {
    const { unreachable } = checkReachability(routerSource, ['<Link to="/sync">'], ["tasks/:id"]);
    expect(unreachable).not.toContain("tasks/:id");
    // Control: allowlisting one route must not quietly excuse the rest.
    expect(unreachable).toContain("workspace-docs");
  });
});

// The guard fooling itself, found by injection during TASK-1767: deleting the
// app's only real link to /tasks/:id left the live check GREEN, because the doc
// comment in route-reachability.ts contains `to={`/tasks/${…}`}` as an example.
// The scanner was reading its own documentation and counting it as a link.
describe("stripComments — prose must never count as a link", () => {
  it("ignores a link written inside a line comment", () => {
    expect(extractLinkTargets('// example: <Link to="/tasks/1">')).toEqual([]);
  });

  it("ignores a link written inside a block comment", () => {
    expect(extractLinkTargets("/* to={`/tasks/${id}`} */")).toEqual([]);
  });

  // Control: stripping must not eat real code, or the guard would report every
  // route unreachable and be just as useless in the opposite direction.
  it("keeps a real link that sits next to a comment", () => {
    const src = '// a note about /tasks/\n<Link to="/projects">';
    expect(extractLinkTargets(src)).toEqual(["/projects"]);
  });
});
