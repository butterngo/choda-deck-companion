import { describe, it, expect } from "vitest";
import { checkPublishEnv } from "./preflight-publish.mjs";
import { parseManifest, compareManifest, sha512Base64 } from "./verify-release-manifest.mjs";

// TASK-1763 — these guards exist to stop a well-formed, uploadable, WRONG manifest
// from shipping. Each test below is paired with a control so it is capable of failing.

// Manifests are line-oriented; building them from an array keeps the fixtures
// readable and avoids escaping newlines inline.
const LINES = (lines) => lines.join("\n") + "\n";

describe("preflight-publish (TASK-1763 AC-1)", () => {
  it("refuses when no token is present — the doomed-build case", () => {
    const r = checkPublishEnv({});
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("gh auth token"); // names the fix, not just the fault
  });

  it("accepts GH_TOKEN, and accepts GITHUB_TOKEN as the CI-provided alias", () => {
    expect(checkPublishEnv({ GH_TOKEN: "ghp_x" }).ok).toBe(true);
    expect(checkPublishEnv({ GITHUB_TOKEN: "ghp_x" }).ok).toBe(true);
  });

  // An empty string is what `export GH_TOKEN=$(gh auth token)` leaves behind when
  // gh is not logged in — the failure mode most likely to be mistaken for success.
  it("treats an EMPTY token as absent, not as present", () => {
    expect(checkPublishEnv({ GH_TOKEN: "" }).ok).toBe(false);
  });
});

describe("parseManifest", () => {
  const YML = [
    "version: 0.7.0",
    "files:",
    "  - url: choda-companion-setup-0.7.0.exe",
    "    sha512: AAA==",
    "    size: 195946375",
    "path: choda-companion-setup-0.7.0.exe",
    "sha512: AAA==",
    "releaseDate: '2026-08-24T03:29:30.595Z'",
  ].join("\n");

  // The regex claims optional whitespace after the colon. Written inside a
  // template literal, `\s` collapses to a literal "s" and the pattern silently
  // becomes /^path:s*(.+)$/ — which still passes every space-separated fixture,
  // because `s*` can match zero and .trim() mops up. The ONLY input that tells
  // the two apart is a colon with no space before a value starting with "s".
  // Verified: with `\s` restored, this test — and only this test — goes red.
  it("honours the optional-whitespace contract: 'key:svalue' keeps its leading s", () => {
    expect(parseManifest(LINES(["path:setup.exe"])).path).toBe("setup.exe");
  });

  it("reads version, path, sha512 and size off a real electron-builder manifest", () => {
    expect(parseManifest(YML)).toEqual({
      version: "0.7.0",
      path: "choda-companion-setup-0.7.0.exe",
      sha512: "AAA==",
      size: 195946375,
    });
  });
});

describe("compareManifest (TASK-1763 AC-2/AC-3)", () => {
  const good = {
    manifest: { version: "0.7.0", sha512: "AAA==", size: 100 },
    pkgVersion: "0.7.0",
    actualSha512: "AAA==",
    actualSize: 100,
  };

  // CONTROL. Without this, every assertion below would pass on a guard that simply
  // always rejects — which would be indistinguishable from a working guard.
  it("passes a manifest that genuinely describes its installer", () => {
    expect(compareManifest(good)).toEqual({ ok: true, problems: [] });
  });

  it("catches the stale-manifest case — the actual production bug", () => {
    const r = compareManifest({ ...good, pkgVersion: "0.8.0" });
    expect(r.ok).toBe(false);
    expect(r.problems.join(" ")).toContain("stale-manifest");
  });

  it("catches a manifest whose sha512 does not describe the bytes on disk", () => {
    const r = compareManifest({ ...good, actualSha512: "BBB==" });
    expect(r.ok).toBe(false);
    expect(r.problems.join(" ")).toContain("sha512 mismatch");
  });

  it("catches a size mismatch — the truncated/dropped-upload shape", () => {
    const r = compareManifest({ ...good, actualSize: 99 });
    expect(r.ok).toBe(false);
    expect(r.problems.join(" ")).toContain("size mismatch");
  });

  it("reports EVERY problem at once, so one fix does not just reveal the next", () => {
    const r = compareManifest({ ...good, pkgVersion: "0.8.0", actualSha512: "BBB==", actualSize: 99 });
    expect(r.problems).toHaveLength(3);
  });
});

describe("sha512Base64", () => {
  it("matches the digest electron-builder writes (base64, not hex)", () => {
    // Known-answer test: sha512("") in base64.
    expect(sha512Base64(Buffer.from(""))).toBe(
      "z4PhNX7vuL3xVChQ1m2AB9Yg5AULVxXcg/SpIdNs6c5H0NE8XYXysP+DGNKHfuwvY7kxvUdBeoGlODJ6+SfaPg==",
    );
  });
});
