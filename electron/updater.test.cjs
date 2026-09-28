const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { initUpdater, readToken, createStatusRecorder } = require("./updater.cjs");

function fakeAutoUpdater() {
  const au = new EventEmitter();
  au.setFeedURL = vi.fn();
  au.checkForUpdates = vi.fn().mockResolvedValue(null);
  au.quitAndInstall = vi.fn();
  return au;
}

const silentLog = { log: () => {}, error: () => {} };

let userData;
beforeEach(() => {
  userData = fs.mkdtempSync(path.join(os.tmpdir(), "cdc-updater-test-"));
  delete process.env.GH_TOKEN;
});

describe("readToken", () => {
  it("reads and trims gh-token.txt", () => {
    fs.writeFileSync(path.join(userData, "gh-token.txt"), "ghp_abc123\n");
    expect(readToken(userData)).toBe("ghp_abc123");
  });

  it("falls back to GH_TOKEN env, else null", () => {
    expect(readToken(userData)).toBe(null);
    process.env.GH_TOKEN = "ghp_env";
    expect(readToken(userData)).toBe("ghp_env");
  });
});

describe("initUpdater", () => {
  it("uses a generic feed when CHODA_UPDATE_FEED_URL is set, even without a token", () => {
    process.env.CHODA_UPDATE_FEED_URL = "http://127.0.0.1:8099";
    try {
      const au = fakeAutoUpdater();
      const u = initUpdater({ autoUpdater: au, userDataDir: userData, onUpdateReady: vi.fn(), log: silentLog });
      expect(u.enabled).toBe(true);
      expect(au.setFeedURL).toHaveBeenCalledWith({ provider: "generic", url: "http://127.0.0.1:8099" });
      u.stop();
    } finally {
      delete process.env.CHODA_UPDATE_FEED_URL;
    }
  });

  // TASK-2164 AC-1 — the repo is public, so no token means the public feed, not
  // "updater off". The old contract (silent no_token disable) left every install
  // without gh-token.txt unable to update, and nothing on screen said so.
  it("uses the public GitHub feed without a token, and checks immediately", () => {
    const au = fakeAutoUpdater();
    const u = initUpdater({ autoUpdater: au, userDataDir: userData, onUpdateReady: vi.fn(), log: silentLog });
    expect(u.enabled).toBe(true);
    expect(au.setFeedURL).toHaveBeenCalledWith({
      provider: "github",
      owner: "butterngo",
      repo: "choda-deck-companion",
      private: false,
    });
    expect(au.checkForUpdates).toHaveBeenCalledTimes(1);
    u.stop();
  });

  // TASK-2164 AC-2 — a token still selects the private feed, so a repo that goes
  // private again only needs gh-token.txt back.
  it("configures the private GitHub feed when a token is present, and checks immediately", () => {
    fs.writeFileSync(path.join(userData, "gh-token.txt"), "ghp_abc");
    const au = fakeAutoUpdater();
    const u = initUpdater({ autoUpdater: au, userDataDir: userData, onUpdateReady: vi.fn(), log: silentLog });
    expect(u.enabled).toBe(true);
    expect(au.setFeedURL).toHaveBeenCalledWith({
      provider: "github",
      owner: "butterngo",
      repo: "choda-deck-companion",
      private: true,
      token: "ghp_abc",
    });
    expect(au.autoDownload).toBe(true);
    expect(au.autoInstallOnAppQuit).toBe(true);
    expect(au.checkForUpdates).toHaveBeenCalledTimes(1);
    u.stop();
  });

  it("fires onUpdateReady when a version is downloaded and can quitAndInstall", () => {
    fs.writeFileSync(path.join(userData, "gh-token.txt"), "ghp_abc");
    const au = fakeAutoUpdater();
    const onUpdateReady = vi.fn();
    const u = initUpdater({ autoUpdater: au, userDataDir: userData, onUpdateReady, log: silentLog });
    au.emit("update-downloaded", { version: "0.2.0" });
    expect(onUpdateReady).toHaveBeenCalledWith({ version: "0.2.0" });
    u.quitAndInstall();
    expect(au.quitAndInstall).toHaveBeenCalled();
    u.stop();
  });

  it("survives a failing check (offline) without throwing", async () => {
    fs.writeFileSync(path.join(userData, "gh-token.txt"), "ghp_abc");
    const au = fakeAutoUpdater();
    au.checkForUpdates = vi.fn().mockRejectedValue(new Error("net down"));
    const u = initUpdater({ autoUpdater: au, userDataDir: userData, onUpdateReady: vi.fn(), log: silentLog });
    await expect(u.check()).resolves.toBe(null);
    u.stop();
  });

  it("survives an updater 'error' event (e.g. invalid/expired token) without throwing", () => {
    fs.writeFileSync(path.join(userData, "gh-token.txt"), "ghp_expired");
    const au = fakeAutoUpdater();
    const u = initUpdater({ autoUpdater: au, userDataDir: userData, onUpdateReady: vi.fn(), log: silentLog });
    expect(() => au.emit("error", new Error("401 Unauthorized"))).not.toThrow();
    u.stop();
  });
});

// TASK-2164 AC-3 — the updater's state must be readable in a packaged build,
// which has no visible console. These read the files a person would open.
describe("updater status files (TASK-2164 AC-3)", () => {
  const readStatus = () => JSON.parse(fs.readFileSync(path.join(userData, "updater-status.json"), "utf8"));
  const readLog = () => fs.readFileSync(path.join(userData, "logs", "updater.log"), "utf8").trim().split("\n");

  it("records start with the feed in use, and never writes the token", () => {
    fs.writeFileSync(path.join(userData, "gh-token.txt"), "ghp_secret123");
    const au = fakeAutoUpdater();
    au.currentVersion = { version: "0.18.2" };
    const u = initUpdater({ autoUpdater: au, userDataDir: userData, onUpdateReady: vi.fn(), log: silentLog });
    expect(readStatus()).toMatchObject({ state: "started", currentVersion: "0.18.2", feed: "github butterngo/choda-deck-companion (private, token)" });
    const onDisk = fs.readFileSync(path.join(userData, "updater-status.json"), "utf8") + readLog().join("\n");
    expect(onDisk).not.toContain("ghp_secret123");
    u.stop();
  });

  it("tracks the lifecycle: checking → available → downloaded, one log line each", () => {
    const au = fakeAutoUpdater();
    const u = initUpdater({ autoUpdater: au, userDataDir: userData, onUpdateReady: vi.fn(), log: silentLog });
    au.emit("checking-for-update");
    expect(readStatus().state).toBe("checking");
    au.emit("update-available", { version: "0.18.3" });
    expect(readStatus()).toMatchObject({ state: "available", version: "0.18.3", feed: "github butterngo/choda-deck-companion (public)" });
    au.emit("update-downloaded", { version: "0.18.3" });
    expect(readStatus()).toMatchObject({ state: "downloaded", version: "0.18.3" });
    expect(readLog().map((l) => l.split(" ")[1])).toEqual(["started", "checking", "available", "downloaded"]);
    u.stop();
  });

  it("records up-to-date when there is nothing newer", () => {
    const au = fakeAutoUpdater();
    const u = initUpdater({ autoUpdater: au, userDataDir: userData, onUpdateReady: vi.fn(), log: silentLog });
    au.emit("update-not-available", { version: "0.18.2" });
    expect(readStatus()).toMatchObject({ state: "up-to-date", version: "0.18.2" });
    u.stop();
  });

  it("records an error event's message, and a failed check", async () => {
    const au = fakeAutoUpdater();
    au.checkForUpdates = vi.fn().mockRejectedValue(new Error("net down"));
    const u = initUpdater({ autoUpdater: au, userDataDir: userData, onUpdateReady: vi.fn(), log: silentLog });
    await u.check();
    expect(readStatus()).toMatchObject({ state: "error", message: "check failed: net down" });
    au.emit("error", new Error("HttpError: 404"));
    expect(readStatus()).toMatchObject({ state: "error", message: "HttpError: 404" });
    expect(readLog().at(-1)).toContain("error message=HttpError: 404");
    u.stop();
  });

  it("rolls the log to updater.log.1 at the cap instead of growing forever", () => {
    const rec = createStatusRecorder(userData, { capBytes: 200 });
    for (let i = 0; i < 20; i++) rec.record("checking");
    expect(fs.existsSync(path.join(userData, "logs", "updater.log.1"))).toBe(true);
    expect(fs.statSync(path.join(userData, "logs", "updater.log")).size).toBeLessThan(200 + 80);
  });

  it("never lets a status write failure reach the updater", () => {
    // userDataDir that does not exist and cannot be created as a directory: a file
    const blocker = path.join(userData, "not-a-dir");
    fs.writeFileSync(blocker, "x");
    const au = fakeAutoUpdater();
    let u;
    expect(() => {
      u = initUpdater({ autoUpdater: au, userDataDir: blocker, onUpdateReady: vi.fn(), log: silentLog });
      au.emit("checking-for-update");
    }).not.toThrow();
    expect(au.checkForUpdates).toHaveBeenCalledTimes(1);
    u.stop();
  });
});
