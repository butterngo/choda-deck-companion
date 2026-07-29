// TASK-1437 — spawns the companion adapter (src/adapters/companion/, built to
// dist/companion-server.cjs in the sibling choda-deck repo) as a child process
// and resolves once it reports its bound port. Kept separate from main.cjs so
// the path-resolution/port-parsing logic is unit-testable without Electron.

const path = require("node:path");
const fs = require("node:fs");
const { spawn } = require("node:child_process");

// The adapter binds an OS-assigned ephemeral port when CHODA_COMPANION_PORT=0
// (see src/adapters/companion/index.ts) — this sidesteps any collision with a
// still-running legacy Task Scheduler instance (TASK-1437 gap sweep) without
// touching the adapter itself. It logs the real port to stderr on boot.
const LISTEN_LINE = /\[companion\] listening on http:\/\/127\.0\.0\.1:(\d+)/;
const BOOT_TIMEOUT_MS = 8000;

// Dev: the adapter's build output lives in the sibling `choda-deck` checkout.
// Packaged: electron-builder vendors a copy into extraResources (see
// scripts/vendor-adapter.mjs + package.json `build.extraResources`).
function resolveAdapterEntry({ isPackaged, resourcesPath, env = process.env } = {}) {
  if (env.CHODA_ADAPTER_ENTRY) return path.resolve(env.CHODA_ADAPTER_ENTRY);
  if (isPackaged) return path.join(resourcesPath, "adapter", "companion-server.cjs");
  return path.resolve(__dirname, "..", "..", "choda-deck", "dist", "companion-server.cjs");
}

// The vendored adapter's require('better-sqlite3') needs its native module
// resolvable — vendor-adapter.mjs copies it to <resources>/adapter/deps (NOT
// node_modules: electron-builder's extraResources file-matcher silently drops
// any nested `node_modules` dir, so the vendored copy is deliberately named
// something else), so NODE_PATH must point there in packaged mode. In dev the
// sibling choda-deck checkout already has its own node_modules, so no
// override is needed (Node resolves it via the entry's own directory).
function resolveNodePath({ isPackaged, resourcesPath, env = process.env } = {}) {
  if (env.CHODA_ADAPTER_NODE_PATH) return path.resolve(env.CHODA_ADAPTER_NODE_PATH);
  if (isPackaged) return path.join(resourcesPath, "adapter", "deps");
  return undefined;
}

// Dev: no override — the adapter falls back to its own `<cwd>/data` default,
// same as running it standalone today. Packaged: a per-app-install data dir
// under Electron's userData, so it survives updates and (per TASK-1438 AC-6)
// is never deleted by uninstall.
function resolveDataDir({ isPackaged, userDataPath, env = process.env } = {}) {
  if (env.CHODA_DATA_DIR) return path.resolve(env.CHODA_DATA_DIR);
  if (isPackaged) return path.join(userDataPath, "data");
  return undefined;
}

// Load persistent sync config from <dataDir>/sync-config.json and map it to the
// adapter's CHODA_* env, so Push/Pull work on ANY launch (Start menu, auto-start)
// without a special launcher or the single-instance-lock dance. Secrets are
// referenced by FILE path (usernameFile/passwordFile/clientSecretFile), never
// inlined. Missing/invalid file → {} (sync stays off, app works as before).
function loadSyncEnv(dataDir) {
  if (!dataDir) return {};
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(path.join(dataDir, "sync-config.json"), "utf8"));
  } catch {
    return {};
  }
  const map = {
    remoteUrl: "CHODA_PULL_REMOTE_URL",
    token: "CHODA_PULL_REMOTE_TOKEN",
    oidcIssuer: "CHODA_SYNC_OIDC_ISSUER",
    oidcClientId: "CHODA_SYNC_OIDC_CLIENT_ID",
    usernameFile: "CHODA_SYNC_OIDC_USERNAME_FILE",
    passwordFile: "CHODA_SYNC_OIDC_PASSWORD_FILE",
    clientSecretFile: "CHODA_SYNC_OIDC_CLIENT_SECRET_FILE",
  };
  const out = {};
  for (const [key, envName] of Object.entries(map)) {
    if (typeof cfg[key] === "string" && cfg[key].length > 0) out[envName] = cfg[key];
  }
  return out;
}

class AdapterBootError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = "AdapterBootError";
    this.cause = cause;
  }
}

// Spawns the adapter and resolves { child, port } once its boot line appears
// on stderr, or rejects with AdapterBootError if it exits/times out first —
// the caller (main.cjs) turns that into the visible error state (AC-7).
function spawnAdapter({ entry, dataDir, nodePath, port = "0", env = process.env, spawnFn = spawn } = {}) {
  const child = spawnFn(process.execPath, [entry], {
    env: {
      // File-based sync config first (defaults); a real process.env wins over it
      // so an explicit launcher/env override still takes precedence.
      ...(dataDir ? loadSyncEnv(dataDir) : {}),
      ...env,
      CHODA_COMPANION_PORT: String(port),
      ...(dataDir ? { CHODA_DATA_DIR: dataDir } : {}),
      ...(nodePath ? { NODE_PATH: nodePath } : {}),
      // process.execPath is the ELECTRON binary in a packaged app, not plain
      // node — without this, spawning it just launches a second Electron
      // instance (which quits immediately, exit code 0) instead of running
      // `entry` as a script. Harmless/no-op when execPath really is node
      // (dev, tests). Real bug found via an actual install, not testing —
      // this env var name is Electron's own documented mechanism for
      // exactly this ("run this script with Node, not as an app").
      ELECTRON_RUN_AS_NODE: "1",
    },
    windowsHide: true,
  });

  const portPromise = new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new AdapterBootError(`adapter did not report a listening port within ${BOOT_TIMEOUT_MS}ms`));
    }, BOOT_TIMEOUT_MS);

    child.stderr?.on("data", (chunk) => {
      const match = LISTEN_LINE.exec(chunk.toString("utf8"));
      if (match && !settled) {
        settled = true;
        clearTimeout(timer);
        resolve(Number(match[1]));
      }
    });

    child.once("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new AdapterBootError("adapter process failed to start", err));
    });

    child.once("exit", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new AdapterBootError(`adapter exited during boot (code ${code})`));
    });
  });

  return { child, portPromise };
}

module.exports = { resolveAdapterEntry, resolveDataDir, resolveNodePath, spawnAdapter, loadSyncEnv, AdapterBootError, LISTEN_LINE };
