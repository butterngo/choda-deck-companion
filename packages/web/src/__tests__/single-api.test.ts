// TASK-1159 AC-1 — the config check: the companion must address exactly one API,
// the laptop adapter, and never a remote/OAuth URL. Two assertions:
//  1. API_BASE is a same-origin relative path (no protocol/host) → the only base.
//  2. No web source file contains an actual remote URL to the pod.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { API_BASE } from "../config";

// vitest runs with cwd = packages/web; scan its src tree. (import.meta.url is an
// http URL under jsdom, so fileURLToPath can't be used here.)
const SRC = join(process.cwd(), "src");
// Matches a real remote URL (protocol + host), not a bare-word mention in a comment.
const REMOTE_URL = /https?:\/\/[^\s'"`]*mcp\.choda\.dev/;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(ent.name)) out.push(p);
  }
  return out;
}

describe("single-API guard (AC-1)", () => {
  it("API_BASE is a same-origin relative path, not a remote URL", () => {
    expect(API_BASE.startsWith("/")).toBe(true);
    expect(API_BASE).not.toMatch(/:\/\//);
  });

  it("no web source references a remote pod URL", () => {
    const offenders = walk(SRC).filter((f) => REMOTE_URL.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
