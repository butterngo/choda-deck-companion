import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { checkPublishEnv } from "./preflight-publish.mjs";
import { parseManifest, compareManifest, sha512Base64 } from "./verify-release-manifest.mjs";
import { checkTagReleases, expectedAssetsFor, nextPageUrl } from "./verify-github-release.mjs";

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

// TASK-2052 AC-1 — the release type is declared, not inherited. electron-builder's
// default is also "draft", so deleting the key would change no behaviour and no
// other check would notice; this test is what makes the declaration load-bearing.
// Why draft and not release: docs/knowledge/publish-as-a-draft-then-flip-it-only-after-github-confirms-the-release.md
describe("build.publish.releaseType (TASK-2052 AC-1)", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

  it("names releaseType explicitly as draft", () => {
    expect(pkg.build.publish).toHaveProperty("releaseType", "draft");
  });
});

// TASK-2052 AC-2/3/4 — the GitHub-side check. Fixtures copy the real shapes seen in
// `gh api repos/butterngo/choda-deck-companion/releases` on 2026-09-27.
describe("checkTagReleases (TASK-2052 AC-2/AC-3/AC-4)", () => {
  const asset = (name, state = "uploaded") => ({ name, state });
  const release = (id, tag, { draft = false, prerelease = false, assets }) => ({
    id, tag_name: tag, draft, prerelease, assets: assets.map((a) => (typeof a === "string" ? asset(a) : a)),
  });
  const expected = expectedAssetsFor("0.18.1");
  const good = release(397071557, "v0.18.1", { assets: expected });

  // CONTROL — a guard that always rejects would pass every red test below.
  it("passes one published release that carries all three assets", () => {
    const r = checkTagReleases({ releases: [good], tag: "v0.18.1", expectedAssets: expected });
    expect(r).toMatchObject({ ok: true, problems: [] });
  });

  it("fails the 2+1 split: two releases on one tag (the v0.15.0 shape)", () => {
    const releases = [
      release(391452079, "v0.15.0", { draft: true, assets: ["choda-companion-setup-0.15.0.exe.blockmap"] }),
      release(391452056, "v0.15.0", { draft: true, assets: ["choda-companion-setup-0.15.0.exe", "latest.yml"] }),
    ];
    const r = checkTagReleases({ releases, tag: "v0.15.0", expectedAssets: expectedAssetsFor("0.15.0"), allowDraft: true });
    expect(r.ok).toBe(false);
    expect(r.problems.join(" ")).toContain("2 releases on tag v0.15.0");
  });

  it("fails a split even when one half is published (the v0.6.1 shape)", () => {
    const releases = [good, release(1, "v0.18.1", { draft: true, assets: ["latest.yml"] })];
    expect(checkTagReleases({ releases, tag: "v0.18.1", expectedAssets: expected }).ok).toBe(false);
  });

  it("fails a draft by default, and names why the feed cannot see it", () => {
    const r = checkTagReleases({ releases: [{ ...good, draft: true }], tag: "v0.18.1", expectedAssets: expected });
    expect(r.ok).toBe(false);
    expect(r.problems.join(" ")).toContain("is a draft");
  });

  it("accepts a complete draft in --promote mode — the state it is allowed to flip", () => {
    const r = checkTagReleases({ releases: [{ ...good, draft: true }], tag: "v0.18.1", expectedAssets: expected, allowDraft: true });
    expect(r.ok).toBe(true);
  });

  it("fails a prerelease — electron-updater skips it", () => {
    const r = checkTagReleases({ releases: [{ ...good, prerelease: true }], tag: "v0.18.1", expectedAssets: expected });
    expect(r.problems.join(" ")).toContain("prerelease");
  });

  it("fails when an expected asset is missing, naming the asset", () => {
    const r = checkTagReleases({ releases: [good], tag: "v0.18.1", expectedAssets: [...expected, "extra.txt"] });
    expect(r.ok).toBe(false);
    expect(r.problems).toEqual(["asset missing from v0.18.1: extra.txt"]);
  });

  it("fails an asset whose upload did not finish — the dropped-installer shape", () => {
    const partial = release(2, "v0.18.1", { assets: [asset(expected[0], "starter"), expected[1], expected[2]] });
    const r = checkTagReleases({ releases: [partial], tag: "v0.18.1", expectedAssets: expected });
    expect(r.problems.join(" ")).toContain('state "starter"');
  });

  it("fails a tag with no release at all", () => {
    expect(checkTagReleases({ releases: [good], tag: "v9.9.9", expectedAssets: expected }).ok).toBe(false);
  });

  it("derives the three asset names from nsis.artifactName", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    expect(pkg.build.nsis.artifactName).toBe("choda-companion-setup-${version}.${ext}");
    expect(expectedAssetsFor("1.2.3")).toEqual([
      "choda-companion-setup-1.2.3.exe", "choda-companion-setup-1.2.3.exe.blockmap", "latest.yml",
    ]);
  });
});

describe("nextPageUrl", () => {
  it("follows rel=next and stops when there is none", () => {
    const link = '<https://api.github.com/x?page=2>; rel="next", <https://api.github.com/x?page=3>; rel="last"';
    expect(nextPageUrl(link)).toBe("https://api.github.com/x?page=2");
    expect(nextPageUrl('<https://api.github.com/x?page=1>; rel="prev"')).toBeUndefined();
    expect(nextPageUrl(null)).toBeUndefined();
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
