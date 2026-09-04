// TASK-1831 — an adapter route with no caller is dead weight that looks alive.
//
// `route-reachability.ts` (TASK-1767) guards WEB routes: every route in the
// router must have an inbound link. It has no opinion about an ADAPTER route
// that nothing requests, and that gap cost a whole feature: GET
// /claude-config/<rootId>/<rel> shipped in TASK-1828 with five acceptance
// criteria, twenty-one tests, three injections and a raw-socket traversal
// guard — and no client ever asked it for a byte. Every criterion was true.
// None of them asked whether anyone calls the thing.
//
// This is the narrow version of the missing guard: the routes this app is
// supposed to consume must appear in non-test source. It is deliberately not a
// general solution — a general one would read the adapter's route table out of
// the sibling checkout, which is a dependency a unit test should not have. What
// it does do is fail the day someone deletes the last caller.

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Every .ts/.tsx under src that is not a test. */
function productionSources(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__") continue;
      productionSources(full, out);
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const SOURCE = productionSources(SRC)
  .map((f) => fs.readFileSync(f, "utf8"))
  .join("\n");

describe("adapter routes this app claims to consume", () => {
  // Matched on a fetch CALL, not on any occurrence of the path.
  //
  // The first version of this guard asserted the string appeared anywhere in
  // production source, and it stayed green when the real request was removed —
  // satisfied by the error message `GET /claude-config/${ref.rootId} failed`.
  // A guard that a comment or a template string can satisfy proves the keyword
  // is present, not that the route is reached.
  const FETCHES_LIST = /fetch\(`\$\{API_BASE\}\/claude-config\$\{/;
  const FETCHES_FILE = /fetch\(`\$\{API_BASE\}\/claude-config\/\$\{/;

  it("the config inventory route has a caller", () => {
    expect(SOURCE).toMatch(FETCHES_LIST);
  });

  it("the config FILE route has a caller", () => {
    // Red from TASK-1828 until TASK-1831: the route existed and nothing fetched it.
    expect(SOURCE).toMatch(FETCHES_FILE);
  });

  it("CONTROL — mentioning the path is not the same as calling it", () => {
    // The guard must reject the shape that fooled its first version.
    const mention = 'throw new Error(`GET /claude-config/${ref.rootId} failed`)';
    expect(mention).not.toMatch(FETCHES_FILE);
  });
});
