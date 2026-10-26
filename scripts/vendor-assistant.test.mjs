// TASK-2761 — the vendor step must ship assistant-server.cjs beside the
// adapter, because the adapter spawns it from its own directory. Run against a
// fake choda-deck checkout that has the adapter bundle but not the assistant
// one: the script must refuse before touching electron/vendor/, and say which
// file is missing.

import { describe, it, expect, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(repoRoot, "scripts", "vendor-adapter.mjs");
let tmp = "";

afterEach(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
  tmp = "";
});

describe("assistant-server.cjs vendoring", () => {
  it("exits non-zero naming assistant-server.cjs when that bundle is missing", () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), "vendor-assistant-"));
    mkdirSync(path.join(tmp, "dist"), { recursive: true });
    writeFileSync(path.join(tmp, "dist", "companion-server.cjs"), "// fake adapter\n");
    const r = spawnSync(process.execPath, [script], {
      env: { ...process.env, CHODA_DECK_ROOT: tmp },
      encoding: "utf8",
    });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("assistant-server.cjs");
  });
});
