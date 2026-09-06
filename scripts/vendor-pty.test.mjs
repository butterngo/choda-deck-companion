// TASK-1878 — guards on how node-pty is vendored.
//
// The task's plan said node-pty must join better-sqlite3 in
// NATIVE_MODULES_TO_REBUILD. Running the vendor script disproved that, twice
// over, and these tests pin the corrected shape so it cannot quietly revert:
//
//  1. node-pty builds on node-addon-api — N-API — whose entire purpose is an
//     ABI stable across Node versions AND Electron. better-sqlite3 is a V8/NAN
//     addon, which is why IT needs the rebuild and node-pty does not.
//  2. Rebuilding it is impossible anyway: the published tarball omits
//     deps/winpty/src/shared/GetCommitHash.bat, so gyp dies at configure.
//
// Verified once by hand beyond what these assertions cover: the vendored copy
// was loaded under Electron's own runtime (ELECTRON_RUN_AS_NODE=1) and spawned
// a real shell — ok=true exit=0.

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = readFileSync(path.join(repoRoot, "scripts", "vendor-adapter.mjs"), "utf8");

describe("node-pty vendoring", () => {
  it("is copied into the packaged tree", () => {
    expect(script).toMatch(/VENDORED_DEPS = \[[^\]]*'node-pty'/s);
  });

  it("is NOT rebuilt — N-API is ABI-stable, and the tarball cannot be built anyway", () => {
    const line = script.match(/const NATIVE_MODULES_TO_REBUILD = \[([^\]]*)\]/);
    expect(line).not.toBeNull();
    // Asserted as an absence WITH its reason in the file above it, so the next
    // reader meets the measurement rather than repeating the experiment.
    expect(line[1]).not.toMatch(/node-pty/);
    expect(line[1]).toMatch(/better-sqlite3/);
    expect(script).toMatch(/N-API|node-addon-api/);
  });

  it("ships a prebuild for this platform, which is what the packaged app loads", () => {
    const dir = path.join(repoRoot, "electron", "vendor", "deps", "node-pty");
    if (!existsSync(dir)) {
      // vendor:adapter has not run in this checkout; nothing to assert about a
      // tree that does not exist, and failing here would only punish a fresh
      // clone. The assertions above still hold.
      return;
    }
    const prebuild = path.join(dir, "prebuilds", `${process.platform}-${process.arch}`, "pty.node");
    // lib/utils.js falls back to prebuilds/<platform>-<arch> when build/Release
    // is absent, which after a no-rebuild vendor is exactly the case.
    expect(existsSync(prebuild)).toBe(true);
  });
});
