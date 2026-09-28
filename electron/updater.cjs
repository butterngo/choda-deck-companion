// TASK-1440 — electron-updater against the GitHub Releases feed.
// Near-verbatim port of english-companion's electron/updater.cjs (that repo's
// own proven mechanism) — same env var precedence, same silent-disable
// contract, same test-only feed override, adapted to this repo/token name.

const fs = require("node:fs");
const path = require("node:path");

const GITHUB_OWNER = "butterngo";
const GITHUB_REPO = "choda-deck-companion";

// TASK-2164 — the repo is public, so the updater needs no token: without one it
// reads the public GitHub feed. A token (in %APPDATA%/choda-deck-companion/
// gh-token.txt, outside the app package, or in GH_TOKEN) still switches it to
// the private feed, so a repo that goes private again only needs the file back.
// This replaces TASK-1440's "no token → updater off", which left every install
// without the file unable to update and said so only to an invisible console.
function readToken(userDataDir) {
  try {
    const fileToken = fs.readFileSync(path.join(userDataDir, "gh-token.txt"), "utf8").trim();
    if (fileToken) return fileToken;
  } catch {
    // no file — fall through to env
  }
  return process.env.GH_TOKEN || null;
}

// TASK-2164 AC-3 — a packaged app has no visible console, so the updater's state
// goes to two files in userData that anyone can open:
//   updater-status.json   the LAST state: what the updater is doing right now
//   logs/updater.log      one line per event, rolled to updater.log.1 at the cap
// Writing is best-effort: a status file that cannot be written must never stop
// the updater, so every failure here is swallowed.
const LOG_CAP_BYTES = 256 * 1024;

function createStatusRecorder(userDataDir, { now = () => new Date(), capBytes = LOG_CAP_BYTES } = {}) {
  const statusFile = path.join(userDataDir, "updater-status.json");
  const logDir = path.join(userDataDir, "logs");
  const logFile = path.join(logDir, "updater.log");
  let feed = null;

  return {
    statusFile,
    logFile,
    setFeed(value) {
      feed = value;
    },
    record(state, extra = {}) {
      const at = now().toISOString();
      const entry = { state, at, feed, ...extra };
      try {
        fs.writeFileSync(statusFile, JSON.stringify(entry, null, 2) + "\n");
      } catch {
        // best-effort, see above
      }
      try {
        fs.mkdirSync(logDir, { recursive: true });
        if (fs.existsSync(logFile) && fs.statSync(logFile).size >= capBytes) {
          fs.renameSync(logFile, logFile + ".1");
        }
        const detail = Object.entries(extra)
          .filter(([, v]) => v !== undefined && v !== null)
          .map(([k, v]) => `${k}=${v}`)
          .join(" ");
        fs.appendFileSync(logFile, `${at} ${state}${detail ? " " + detail : ""}\n`);
      } catch {
        // best-effort, see above
      }
    },
  };
}

// autoUpdater is injected so tests can drive the event flow without Electron.
function initUpdater({ autoUpdater, userDataDir, onUpdateReady, intervalMs = 4 * 60 * 60 * 1000, log = console, status = createStatusRecorder(userDataDir) } = {}) {
  // Test hook: CHODA_UPDATE_FEED_URL points the updater at a plain static
  // file server (latest.yml + installer) instead of GitHub — lets the full
  // check → download → install flow run against a local build, no token.
  const feedOverride = process.env.CHODA_UPDATE_FEED_URL;
  if (feedOverride) {
    autoUpdater.setFeedURL({ provider: "generic", url: feedOverride });
    status.setFeed(`generic ${feedOverride}`);
  } else {
    const token = readToken(userDataDir);
    const feed = { provider: "github", owner: GITHUB_OWNER, repo: GITHUB_REPO };
    autoUpdater.setFeedURL(token ? { ...feed, private: true, token } : { ...feed, private: false });
    // The token itself is never written, only whether one is in use.
    status.setFeed(`github ${GITHUB_OWNER}/${GITHUB_REPO} (${token ? "private, token" : "public"})`);
  }
  const currentVersion = autoUpdater.currentVersion?.version ?? null;
  status.record("started", { currentVersion });
  log.log(`[updater] started; status in ${status.statusFile}`);
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
    const message = err && err.message ? err.message : String(err);
    status.record("error", { message });
    log.error("[updater] " + message);
  });
  autoUpdater.on("checking-for-update", () => status.record("checking"));
  autoUpdater.on("update-not-available", (info) => status.record("up-to-date", { version: info?.version }));
  autoUpdater.on("update-available", (info) => status.record("available", { version: info?.version }));
  autoUpdater.on("update-downloaded", (info) => {
    status.record("downloaded", { version: info.version });
    log.log(`[updater] v${info.version} downloaded, ready to install`);
    onUpdateReady?.(info);
  });

  const check = () =>
    autoUpdater.checkForUpdates().catch((err) => {
      // offline / rate-limited / no release yet — retry on the next tick
      status.record("error", { message: "check failed: " + err.message });
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

module.exports = { initUpdater, readToken, createStatusRecorder };
