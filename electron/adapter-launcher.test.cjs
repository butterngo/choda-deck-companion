const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { EventEmitter } = require("node:events");
const { resolveAdapterEntry, resolveDataDir, resolveNodePath, resolveBridgeToken, spawnAdapter, loadSyncEnv, AdapterBootError } = require("./adapter-launcher.cjs");

describe("resolveBridgeToken", () => {
  it("returns undefined with no dataDir and no env", () => {
    expect(resolveBridgeToken({ env: {} })).toBeUndefined();
  });

  it("prefers CHODA_BRIDGE_TOKEN env over the file", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "choda-tok-"));
    fs.writeFileSync(path.join(dir, "bridge-token.txt"), "from-file");
    expect(resolveBridgeToken({ dataDir: dir, env: { CHODA_BRIDGE_TOKEN: "from-env" } })).toBe("from-env");
  });

  it("reads (trimmed) <dataDir>/bridge-token.txt when no env is set", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "choda-tok-"));
    fs.writeFileSync(path.join(dir, "bridge-token.txt"), "  tok-xyz\n");
    expect(resolveBridgeToken({ dataDir: dir, env: {} })).toBe("tok-xyz");
  });

  it("returns undefined when the token file is missing or empty (no crash)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "choda-tok-"));
    expect(resolveBridgeToken({ dataDir: dir, env: {} })).toBeUndefined();
    fs.writeFileSync(path.join(dir, "bridge-token.txt"), "   \n");
    expect(resolveBridgeToken({ dataDir: dir, env: {} })).toBeUndefined();
  });
});

describe("loadSyncEnv", () => {
  it("returns {} when no dataDir or no config file", () => {
    expect(loadSyncEnv(undefined)).toEqual({});
    expect(loadSyncEnv(fs.mkdtempSync(path.join(os.tmpdir(), "choda-sync-")))).toEqual({});
  });

  it("maps sync-config.json fields to CHODA_* env, skipping absent keys", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "choda-sync-"));
    fs.writeFileSync(
      path.join(dir, "sync-config.json"),
      JSON.stringify({
        remoteUrl: "https://mcp.choda.dev",
        oidcIssuer: "https://id.choda.dev/realms/demo",
        oidcClientId: "claude-connector",
        usernameFile: "C:/s/u.txt",
        passwordFile: "C:/s/p.txt",
        clientSecretFile: "C:/s/c.txt",
      }),
    );
    expect(loadSyncEnv(dir)).toEqual({
      CHODA_PULL_REMOTE_URL: "https://mcp.choda.dev",
      CHODA_SYNC_OIDC_ISSUER: "https://id.choda.dev/realms/demo",
      CHODA_SYNC_OIDC_CLIENT_ID: "claude-connector",
      CHODA_SYNC_OIDC_USERNAME_FILE: "C:/s/u.txt",
      CHODA_SYNC_OIDC_PASSWORD_FILE: "C:/s/p.txt",
      CHODA_SYNC_OIDC_CLIENT_SECRET_FILE: "C:/s/c.txt",
    });
  });

  it("returns {} on malformed JSON (never throws)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "choda-sync-"));
    fs.writeFileSync(path.join(dir, "sync-config.json"), "{not json");
    expect(loadSyncEnv(dir)).toEqual({});
  });
});

describe("resolveAdapterEntry", () => {
  it("prefers CHODA_ADAPTER_ENTRY when set (dev/test override)", () => {
    const got = resolveAdapterEntry({ isPackaged: false, env: { CHODA_ADAPTER_ENTRY: "C:/scratch/companion-server.cjs" } });
    expect(got).toBe(path.resolve("C:/scratch/companion-server.cjs"));
  });

  it("resolves to the vendored copy under resourcesPath when packaged", () => {
    const got = resolveAdapterEntry({ isPackaged: true, resourcesPath: "C:/app/resources", env: {} });
    expect(got).toBe(path.join("C:/app/resources", "adapter", "companion-server.cjs"));
  });

  it("resolves to the sibling choda-deck checkout's build output in dev", () => {
    const got = resolveAdapterEntry({ isPackaged: false, env: {} });
    expect(got).toBe(path.resolve(__dirname, "..", "..", "choda-deck", "dist", "companion-server.cjs"));
  });
});

describe("resolveDataDir", () => {
  it("prefers CHODA_DATA_DIR when set", () => {
    expect(resolveDataDir({ isPackaged: true, userDataPath: "C:/u", env: { CHODA_DATA_DIR: "C:/custom" } })).toBe(
      path.resolve("C:/custom"),
    );
  });

  it("uses userData/data when packaged with no override", () => {
    expect(resolveDataDir({ isPackaged: true, userDataPath: "C:/u", env: {} })).toBe(path.join("C:/u", "data"));
  });

  it("returns undefined in dev with no override (adapter falls back to its own default)", () => {
    expect(resolveDataDir({ isPackaged: false, userDataPath: "C:/u", env: {} })).toBeUndefined();
  });
});

describe("resolveNodePath", () => {
  it("prefers CHODA_ADAPTER_NODE_PATH when set", () => {
    expect(resolveNodePath({ isPackaged: true, resourcesPath: "C:/app/resources", env: { CHODA_ADAPTER_NODE_PATH: "C:/x" } })).toBe(
      path.resolve("C:/x"),
    );
  });

  it("points at the vendored deps dir when packaged (not node_modules — electron-builder drops that)", () => {
    expect(resolveNodePath({ isPackaged: true, resourcesPath: "C:/app/resources", env: {} })).toBe(
      path.join("C:/app/resources", "adapter", "deps"),
    );
  });

  it("returns undefined in dev with no override (sibling repo resolves its own deps)", () => {
    expect(resolveNodePath({ isPackaged: false, resourcesPath: "C:/app/resources", env: {} })).toBeUndefined();
  });
});

function fakeChild() {
  const child = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn();
  return child;
}

describe("spawnAdapter", () => {
  it("resolves with the port parsed from the adapter's boot line", async () => {
    const child = fakeChild();
    const spawnFn = vi.fn(() => child);
    const { portPromise } = spawnAdapter({ entry: "x.cjs", spawnFn });
    child.stderr.emit("data", Buffer.from("[companion] listening on http://127.0.0.1:54321 (db: x)\n"));
    await expect(portPromise).resolves.toBe(54321);
  });

  it("rejects with AdapterBootError if the process exits before booting", async () => {
    const child = fakeChild();
    const spawnFn = vi.fn(() => child);
    const { portPromise } = spawnAdapter({ entry: "x.cjs", spawnFn });
    child.emit("exit", 1);
    await expect(portPromise).rejects.toBeInstanceOf(AdapterBootError);
  });

  it("rejects with AdapterBootError if the process errors on spawn", async () => {
    const child = fakeChild();
    const spawnFn = vi.fn(() => child);
    const { portPromise } = spawnAdapter({ entry: "x.cjs", spawnFn });
    child.emit("error", new Error("ENOENT"));
    await expect(portPromise).rejects.toBeInstanceOf(AdapterBootError);
  });

  it("passes CHODA_COMPANION_PORT=0 by default so the OS picks a free port (avoids the legacy-service collision)", () => {
    const child = fakeChild();
    const spawnFn = vi.fn(() => child);
    spawnAdapter({ entry: "x.cjs", spawnFn, env: {} });
    const [, , opts] = spawnFn.mock.calls[0];
    expect(opts.env.CHODA_COMPANION_PORT).toBe("0");
  });

  it("sets ELECTRON_RUN_AS_NODE=1 — without it, spawning process.execPath in a packaged app launches a second Electron instance instead of running the script (found via a real install: 'adapter exited during boot (code 0)')", () => {
    const child = fakeChild();
    const spawnFn = vi.fn(() => child);
    spawnAdapter({ entry: "x.cjs", spawnFn, env: {} });
    const [, , opts] = spawnFn.mock.calls[0];
    expect(opts.env.ELECTRON_RUN_AS_NODE).toBe("1");
  });
});

// TASK-1510 — the adapter warns on stderr when its data dir holds no database while
// another location does. The launcher used to read stderr for the listen line only and
// throw the rest away, so a fresh install opened blank with no explanation.
describe("spawnAdapter — data-dir warning capture (TASK-1510)", () => {
  const WARNING =
    "[choda-deck] No database found in C:/Users/u/AppData/Roaming/choda-deck-companion/data, but 1 other location(s) hold one:\n" +
    "  C:/dev/choda-deck/data/database/choda-deck.db — 14.8 MB, modified 2026-08-05T03:43:56.526Z\n" +
    "Starting here would create a second database with no indication which is live.\n";
  const LISTEN = "[companion] listening on http://127.0.0.1:54321 (db: x)\n";

  it("captures the warning and still resolves the port", async () => {
    const child = fakeChild();
    const { portPromise, dataDirWarning } = spawnAdapter({ entry: "x.cjs", spawnFn: vi.fn(() => child) });
    child.stderr.emit("data", Buffer.from(WARNING + LISTEN));
    await expect(portPromise).resolves.toBe(54321);
    expect(dataDirWarning.text).toContain("No database found in");
    expect(dataDirWarning.text).toContain("which is live");
  });

  it("leaves the warning null on a normal boot", async () => {
    const child = fakeChild();
    const { portPromise, dataDirWarning } = spawnAdapter({ entry: "x.cjs", spawnFn: vi.fn(() => child) });
    child.stderr.emit("data", Buffer.from(LISTEN));
    await expect(portPromise).resolves.toBe(54321);
    expect(dataDirWarning.text).toBeNull();
  });

  it("still finds the port when the warning splits the stream mid-line", async () => {
    // The regression this guards: matching per-chunk instead of against the accumulated
    // buffer. The warning pushes the listen line across a chunk boundary, and a
    // per-chunk matcher then never sees a complete listen line — boot hangs for 8s and
    // fails with a timeout that looks nothing like its cause.
    const child = fakeChild();
    const { portPromise, dataDirWarning } = spawnAdapter({ entry: "x.cjs", spawnFn: vi.fn(() => child) });
    const all = WARNING + LISTEN;
    const cut = WARNING.length + 20; // mid-way through "[companion] listening on http…"
    child.stderr.emit("data", Buffer.from(all.slice(0, cut)));
    child.stderr.emit("data", Buffer.from(all.slice(cut)));
    await expect(portPromise).resolves.toBe(54321);
    expect(dataDirWarning.text).toContain("No database found in");
  });

  it("captures a warning split across two chunks", async () => {
    const child = fakeChild();
    const { portPromise, dataDirWarning } = spawnAdapter({ entry: "x.cjs", spawnFn: vi.fn(() => child) });
    child.stderr.emit("data", Buffer.from(WARNING.slice(0, 60)));
    child.stderr.emit("data", Buffer.from(WARNING.slice(60) + LISTEN));
    await expect(portPromise).resolves.toBe(54321);
    expect(dataDirWarning.text).toContain("which is live");
  });
});
