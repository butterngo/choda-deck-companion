const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { initUpdater, readToken } = require("./updater.cjs");

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

  it("is a no-op without a token — disables silently, never crashes", () => {
    const au = fakeAutoUpdater();
    const u = initUpdater({ autoUpdater: au, userDataDir: userData, onUpdateReady: vi.fn(), log: silentLog });
    expect(u.enabled).toBe(false);
    expect(u.reason).toBe("no_token");
    expect(au.setFeedURL).not.toHaveBeenCalled();
    expect(au.checkForUpdates).not.toHaveBeenCalled();
  });

  it("configures the private GitHub feed and checks immediately", () => {
    fs.writeFileSync(path.join(userData, "gh-token.txt"), "ghp_abc");
    const au = fakeAutoUpdater();
    const u = initUpdater({ autoUpdater: au, userDataDir: userData, onUpdateReady: vi.fn(), log: silentLog });
    expect(u.enabled).toBe(true);
    expect(au.setFeedURL).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "github", owner: "butterngo", repo: "choda-deck-companion", private: true, token: "ghp_abc" }),
    );
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
