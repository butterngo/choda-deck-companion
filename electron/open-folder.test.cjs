// TASK-2050 — the guard on the app's first hand-off to the operating system.
//
// Every refusal test asserts TWO things: the result is not ok, AND shell.openPath
// was never called. Asserting only the result would pass against a handler that
// opens the path and then reports failure — which is the whole of the damage.
//
// The contract under test is "a path RELATIVE to the vault, joined onto a root
// this process owns". An absolute path is refused rather than checked, so there
// is no second way in to keep correct.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createOpenFolderHandler, isInside, stripVaultPrefix } = require("./open-folder.cjs");

let vaultDir;
let outside;
let opened;
let shell;

/** A shell that records what it was asked to open and never touches the OS. */
function recordingShell(err = "") {
  opened = [];
  return {
    openPath: async (p) => {
      opened.push(p);
      return err;
    },
  };
}

beforeEach(() => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "choda-open-folder-"));
  vaultDir = path.join(tmp, "vault");
  outside = path.join(tmp, "elsewhere");
  fs.mkdirSync(path.join(vaultDir, "10-Projects", "mantu", "meetings", "2026-09-20-kate"), {
    recursive: true,
  });
  fs.mkdirSync(path.join(tmp, "vault-evil"), { recursive: true });
  fs.mkdirSync(outside, { recursive: true });
  fs.writeFileSync(path.join(outside, "secret.txt"), "private", "utf8");
  fs.writeFileSync(path.join(vaultDir, "a-file.md"), "# not a folder", "utf8");
  fs.writeFileSync(path.join(vaultDir, "payload.bat"), "@echo off\r\n", "utf8");
  shell = recordingShell();
});

describe("opening a folder in the vault", () => {
  it("joins the relative path onto the configured root and opens it", async () => {
    const open = createOpenFolderHandler({ shell, vaultDir });

    expect(await open("vault/10-Projects/mantu/meetings/2026-09-20-kate")).toEqual({ ok: true });
    expect(opened).toEqual([
      path.resolve(vaultDir, "10-Projects", "mantu", "meetings", "2026-09-20-kate"),
    ]);
  });

  it("accepts the path with or without the display-only 'vault/' prefix", async () => {
    const open = createOpenFolderHandler({ shell, vaultDir });
    expect((await open("10-Projects/mantu")).ok).toBe(true);
    expect((await open("vault/10-Projects/mantu")).ok).toBe(true);
    expect(opened[0]).toBe(opened[1]);
  });

  it("opens the vault root itself", async () => {
    const open = createOpenFolderHandler({ shell, vaultDir });
    expect((await open("vault")).ok).toBe(true);
  });

  it("reports the shell's own failure rather than claiming success", async () => {
    // openPath resolves with an ERROR STRING, empty when it worked — a contract
    // easy to read backwards, so it is asserted directly.
    const failing = { openPath: async () => "Windows cannot find that folder" };
    const open = createOpenFolderHandler({ shell: failing, vaultDir });

    const r = await open("10-Projects/mantu");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("cannot find");
  });
});

// AC-1 / AC-2 / AC-3
describe("the guard", () => {
  it("refuses a relative path that walks out of the vault, and opens nothing", async () => {
    const open = createOpenFolderHandler({ shell, vaultDir });

    for (const attempt of [
      "../elsewhere",
      "..\\elsewhere",
      "10-Projects/../../elsewhere",
      "vault/../elsewhere",
      "vault/10-Projects/../../../elsewhere",
      decodeURIComponent("%2e%2e/elsewhere"),
    ]) {
      const r = await open(attempt);
      expect(r.ok).toBe(false);
      expect(r.reason).toBe("outside the vault");
    }
    expect(opened).toEqual([]);
  });

  // AC-2 — the renderer cannot name a root
  it("refuses an absolute path outright rather than checking it", async () => {
    const open = createOpenFolderHandler({ shell, vaultDir });

    for (const attempt of [outside, vaultDir, "C:\\Windows", "/etc", "\\\\server\\share"]) {
      const r = await open(attempt);
      expect(r.ok).toBe(false);
      expect(r.reason).toBe("path must be relative to the vault");
    }
    expect(opened).toEqual([]);
  });

  it("does not treat a sibling with the root as a prefix as inside it", async () => {
    // `<tmp>/vault-evil` must not pass because `<tmp>/vault` is a string prefix.
    const open = createOpenFolderHandler({ shell, vaultDir });
    const r = await open("../vault-evil");
    expect(r.ok).toBe(false);
    expect(opened).toEqual([]);
  });

  it("opens nothing at all when no vault is configured", async () => {
    for (const dir of [undefined, "", "   ", null]) {
      const open = createOpenFolderHandler({ shell, vaultDir: dir });
      const r = await open("10-Projects/mantu");
      expect(r.ok).toBe(false);
      expect(r.reason).toBe("no vault configured");
    }
    expect(opened).toEqual([]);
  });

  // AC-4 — the one that would turn this into a launcher
  it("refuses a file, so it cannot launch anything", async () => {
    const open = createOpenFolderHandler({ shell, vaultDir });

    expect(await open("a-file.md")).toEqual({ ok: false, reason: "not a directory" });
    // The case that matters: shell.openPath on a .bat RUNS it.
    expect(await open("payload.bat")).toEqual({ ok: false, reason: "not a directory" });

    expect(opened).toEqual([]);
  });

  it("refuses a path that does not exist", async () => {
    const open = createOpenFolderHandler({ shell, vaultDir });
    expect(await open("10-Projects/never-created")).toEqual({ ok: false, reason: "not found" });
    expect(opened).toEqual([]);
  });

  it.each([
    ["", "empty"],
    ["   ", "blank"],
    [null, "null"],
    [undefined, "undefined"],
    [42, "a number"],
    [{ path: "10-Projects" }, "an object"],
    [["10-Projects"], "an array"],
  ])("refuses %s (%s) without touching the filesystem", async (input) => {
    const open = createOpenFolderHandler({
      shell,
      vaultDir,
      statSync: () => {
        throw new Error("statSync must not be reached for a malformed input");
      },
    });
    expect((await open(input)).ok).toBe(false);
    expect(opened).toEqual([]);
  });
});

describe("isInside", () => {
  it("accepts the root and anything under it", () => {
    expect(isInside("/a/b", "/a/b")).toBe(true);
    expect(isInside("/a/b", "/a/b/c/d")).toBe(true);
  });

  it("rejects a parent, a sibling and a prefix-sharing sibling", () => {
    expect(isInside("/a/b", "/a")).toBe(false);
    expect(isInside("/a/b", "/a/c")).toBe(false);
    expect(isInside("/a/b", "/a/bb")).toBe(false);
  });
});

describe("stripVaultPrefix", () => {
  it("removes only a leading vault segment", () => {
    expect(stripVaultPrefix("vault/10-Projects/x")).toBe("10-Projects/x");
    expect(stripVaultPrefix("vault\\10-Projects\\x")).toBe("10-Projects\\x");
    expect(stripVaultPrefix("10-Projects/x")).toBe("10-Projects/x");
  });

  it("does not strip a folder that merely starts with the word", () => {
    expect(stripVaultPrefix("vaults/x")).toBe("vaults/x");
    expect(stripVaultPrefix("10-Projects/vault/x")).toBe("10-Projects/vault/x");
  });
});
