// TASK-2145 AC-3 — the preload exposes a FIXED set of functions, one channel
// each, and never ipcRenderer or a generic invoke. Loaded against a stubbed
// `electron` module so the real bridge file is what is under test.

const path = require("node:path");

function loadPreload() {
  const exposed = {};
  const invoked = [];
  const stub = {
    contextBridge: {
      exposeInMainWorld: (key, api) => {
        exposed[key] = api;
      },
    },
    ipcRenderer: {
      invoke: (...args) => {
        invoked.push(args);
        return Promise.resolve({ ok: true });
      },
    },
  };
  const electronId = require.resolve("electron");
  const preloadId = path.join(__dirname, "preload.cjs");
  const savedElectron = require.cache[electronId];
  require.cache[electronId] = { id: electronId, filename: electronId, loaded: true, exports: stub };
  delete require.cache[preloadId];
  try {
    require(preloadId);
  } finally {
    if (savedElectron) require.cache[electronId] = savedElectron;
    else delete require.cache[electronId];
    delete require.cache[preloadId];
  }
  return { exposed, invoked };
}

describe("preload bridge", () => {
  it("exposes exactly its fixed functions under window.choda", () => {
    const { exposed } = loadPreload();
    expect(Object.keys(exposed)).toEqual(["choda"]);
    expect(Object.keys(exposed.choda).sort()).toEqual(["copySecret", "listSecretFiles", "listSecrets", "openFolder", "openHtml", "revealSecret", "setTheme"]);
    for (const fn of Object.values(exposed.choda)) expect(typeof fn).toBe("function");
  });

  it("each function invokes its own fixed channel with only its arguments", async () => {
    const { exposed, invoked } = loadPreload();
    await exposed.choda.openFolder("vault/x");
    await exposed.choda.openHtml("ws", "docs/r.html");
    await exposed.choda.listSecretFiles();
    await exposed.choda.listSecrets("ws");
    await exposed.choda.copySecret("ws", "t.txt", "key");
    await exposed.choda.revealSecret("ws", "t.txt", "key");
    await exposed.choda.setTheme("dark");
    expect(invoked).toEqual([
      ["choda:open-folder", "vault/x"],
      ["choda:open-html", "ws", "docs/r.html"],
      ["choda:list-secret-files"],
      ["choda:list-secrets", "ws"],
      ["choda:copy-secret", "ws", "t.txt", "key"],
      ["choda:reveal-secret", "ws", "t.txt", "key"],
      ["choda:set-theme", "dark"],
    ]);
  });
});
