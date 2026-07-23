// TASK-1440 — electron-updater against a private GitHub Releases feed.
// Near-verbatim port of english-companion's electron/updater.cjs (that repo's
// own proven mechanism) — same env var precedence, same silent-disable
// contract, same test-only feed override, adapted to this repo/token name.

const fs = require("node:fs");
const path = require("node:path");

const GITHUB_OWNER = "butterngo";
const GITHUB_REPO = "choda-deck-companion";

// The repo is private, so update checks need a GitHub token with repo read
// access at runtime. It lives OUTSIDE the app package, in the user's profile
// (%APPDATA%/choda-companion/gh-token.txt), or in the GH_TOKEN env var.
// No token → updater stays off; the app works exactly as before.
function readToken(userDataDir) {
  try {
    const fileToken = fs.readFileSync(path.join(userDataDir, "gh-token.txt"), "utf8").trim();
    if (fileToken) return fileToken;
  } catch {
    // no file — fall through to env
  }
  return process.env.GH_TOKEN || null;
}

// autoUpdater is injected so tests can drive the event flow without Electron.
function initUpdater({ autoUpdater, userDataDir, onUpdateReady, intervalMs = 4 * 60 * 60 * 1000, log = console } = {}) {
  // Test hook: CHODA_UPDATE_FEED_URL points the updater at a plain static
  // file server (latest.yml + installer) instead of GitHub — lets the full
  // check → download → install flow run against a local build, no token.
  const feedOverride = process.env.CHODA_UPDATE_FEED_URL;
  if (feedOverride) {
    autoUpdater.setFeedURL({ provider: "generic", url: feedOverride });
  } else {
    const token = readToken(userDataDir);
    if (!token) {
      log.log("[updater] no gh-token.txt and no GH_TOKEN — auto-update disabled");
      return { enabled: false, reason: "no_token" };
    }
    autoUpdater.setFeedURL({
      provider: "github",
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      private: true,
      token,
    });
  }
  autoUpdater.autoDownload = true;
  // Fallback: even if the user never explicitly restarts, the staged version
  // installs on the next real quit.
  autoUpdater.autoInstallOnAppQuit = true;

  // NFR gap sweep — every one of these must degrade to a log line, never a
  // crash or a blocking dialog: bad/expired token surfaces here as an
  // "error" event from a failed auth request; a corrupt/partial download is
  // reported the same way by electron-updater itself; an offline poll is
  // caught by `check()`'s own .catch below.
  autoUpdater.on("error", (err) => {
    log.error("[updater] " + (err && err.message ? err.message : err));
  });
  autoUpdater.on("update-downloaded", (info) => {
    log.log(`[updater] v${info.version} downloaded, ready to install`);
    onUpdateReady?.(info);
  });

  const check = () =>
    autoUpdater.checkForUpdates().catch((err) => {
      // offline / rate-limited / no release yet — retry on the next tick
      log.error("[updater] check failed: " + err.message);
      return null;
    });

  check();
  const timer = setInterval(check, intervalMs);
  timer.unref?.();

  return {
    enabled: true,
    check,
    quitAndInstall: () => autoUpdater.quitAndInstall(),
    stop: () => clearInterval(timer),
  };
}

module.exports = { initUpdater, readToken };
