const path = require("node:path");
const { EventEmitter } = require("node:events");
const { resolveAdapterEntry, resolveDataDir, resolveNodePath, spawnAdapter, AdapterBootError } = require("./adapter-launcher.cjs");

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
