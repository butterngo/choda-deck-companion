// TASK-1437 — spawns the companion adapter (src/adapters/companion/, built to
// dist/companion-server.cjs in the sibling choda-deck repo) as a child process
// and resolves once it reports its bound port. Kept separate from main.cjs so
// the path-resolution/port-parsing logic is unit-testable without Electron.

const path = require("node:path");
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
      ...env,
      CHODA_COMPANION_PORT: String(port),
      ...(dataDir ? { CHODA_DATA_DIR: dataDir } : {}),
      ...(nodePath ? { NODE_PATH: nodePath } : {}),
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

module.exports = { resolveAdapterEntry, resolveDataDir, resolveNodePath, spawnAdapter, AdapterBootError, LISTEN_LINE };
