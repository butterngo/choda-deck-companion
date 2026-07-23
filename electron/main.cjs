// TASK-1437 — Electron shell: spawns the companion adapter as a child process,
// serves the built web UI + proxies /api to it over a local static-proxy
// server (see static-proxy-server.cjs for why), and opens one window. No
// changes to the adapter (choda-deck repo) or packages/web's own source.

const { app, BrowserWindow, dialog } = require("electron");
const path = require("node:path");
const { resolveAdapterEntry, resolveDataDir, resolveNodePath, spawnAdapter } = require("./adapter-launcher.cjs");
const { createStaticProxyServer } = require("./static-proxy-server.cjs");
const { configureLoginItem } = require("./login-item.cjs");

// AC-6 — a second launch (or a launch while auto-started instance is already
// running) focuses the existing window instead of spawning a second adapter
// against the same SQLite file.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const [win] = BrowserWindow.getAllWindows();
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });

  let adapterChild = null;

  app.whenReady().then(async () => {
    configureLoginItem({ app, isPackaged: app.isPackaged });

    const staticDir = path.join(__dirname, "..", "packages", "web", "dist");
    const entry = resolveAdapterEntry({ isPackaged: app.isPackaged, resourcesPath: process.resourcesPath });
    const dataDir = resolveDataDir({ isPackaged: app.isPackaged, userDataPath: app.getPath("userData") });
    const nodePath = resolveNodePath({ isPackaged: app.isPackaged, resourcesPath: process.resourcesPath });

    let apiPort;
    try {
      const { child, portPromise } = spawnAdapter({ entry, dataDir, nodePath });
      adapterChild = child;
      apiPort = await portPromise;
    } catch (err) {
      // AC-7 — adapter crash/bind-failure during boot surfaces a visible
      // error, never a blank/frozen window.
      dialog.showErrorBox(
        "Choda Companion couldn't start",
        `The local adapter failed to boot:\n\n${err.message}\n\nCheck the logs and try again.`,
      );
      app.quit();
      return;
    }

    const uiServer = createStaticProxyServer({ staticDir, apiPort });
    uiServer.listen(0, "127.0.0.1", () => {
      const { port: uiPort } = uiServer.address();
      console.log(`[electron] serving UI on http://127.0.0.1:${uiPort} (adapter on 127.0.0.1:${apiPort})`);
      const win = new BrowserWindow({
        width: 1280,
        height: 800,
        webPreferences: {
          // NFR Security — no devtools/remote debugging surface in production.
          devTools: !app.isPackaged,
          contextIsolation: true,
          nodeIntegration: false,
        },
      });
      win.loadURL(`http://127.0.0.1:${uiPort}/`);
    });

    app.on("before-quit", () => {
      adapterChild?.kill();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
