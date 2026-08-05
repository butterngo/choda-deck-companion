// TASK-1437 — Electron shell: spawns the companion adapter as a child process,
// serves the built web UI + proxies /api to it over a local static-proxy
// server (see static-proxy-server.cjs for why), and opens one window. No
// changes to the adapter (choda-deck repo) or packages/web's own source.

const { app, BrowserWindow, dialog, Menu, Tray, Notification, nativeImage, session, desktopCapturer } = require("electron");
const path = require("node:path");
const { resolveAdapterEntry, resolveDataDir, resolveNodePath, resolveBridgeToken, spawnAdapter } = require("./adapter-launcher.cjs");
const { createStaticProxyServer } = require("./static-proxy-server.cjs");
const { configureLoginItem } = require("./login-item.cjs");
const { initUpdater } = require("./updater.cjs");

// PNG works for the window + tray; packaged builds also bake the .ico into the
// exe via electron-builder. Same asset english-companion uses for its tray.
const appIcon = nativeImage.createFromPath(path.join(__dirname, "..", "public", "icon.png"));

// Set once initUpdater runs (packaged + token present); the tray grows a
// "Restart to update" entry when a new version has been downloaded — mirrors
// english-companion's update surface.
let tray = null;
let updater = null;

function showWindow() {
  const [win] = BrowserWindow.getAllWindows();
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

// The tray only carries the update affordance here (no close-to-tray) — closing
// the last window still quits, same as before. The "Restart to update to vX"
// item appears once an update has downloaded, exactly like english-companion.
function setTrayMenu(updateVersion) {
  if (!tray) return;
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open Choda Companion", click: () => showWindow() },
      ...(updateVersion
        ? [
            {
              label: `Restart to update to v${updateVersion}`,
              click: () => updater?.quitAndInstall(),
            },
          ]
        : []),
      { type: "separator" },
      { label: "Quit", click: () => app.quit() },
    ]),
  );
}

function createTray() {
  tray = new Tray(appIcon.resize({ width: 16, height: 16 }));
  tray.setToolTip("Choda Companion");
  setTrayMenu(null);
  tray.on("click", () => showWindow());
}

// AC-6 — a second launch (or a launch while auto-started instance is already
// running) focuses the existing window instead of spawning a second adapter
// against the same SQLite file.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    showWindow();
  });

  let adapterChild = null;

  app.whenReady().then(async () => {
    configureLoginItem({ app, isPackaged: app.isPackaged });

    // TASK-1494 — screen capture. Electron ships no built-in screen picker, so a
    // renderer getDisplayMedia() call rejects unless we handle the request here.
    // Grant the primary screen (video only — this is a screenshot, no audio).
    // Same pattern as english-companion's Watch tab.
    session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
      desktopCapturer
        .getSources({ types: ["screen"] })
        .then((sources) => {
          if (!sources.length) return callback(); // no source → reject cleanly
          callback({ video: sources[0] });
        })
        .catch(() => callback());
    });

    const staticDir = path.join(__dirname, "..", "packages", "web", "dist");
    const entry = resolveAdapterEntry({ isPackaged: app.isPackaged, resourcesPath: process.resourcesPath });
    const dataDir = resolveDataDir({ isPackaged: app.isPackaged, userDataPath: app.getPath("userData") });
    const nodePath = resolveNodePath({ isPackaged: app.isPackaged, resourcesPath: process.resourcesPath });

    let apiPort;
    let dataDirWarning;
    try {
      const spawned = spawnAdapter({ entry, dataDir, nodePath });
      adapterChild = spawned.child;
      dataDirWarning = spawned.dataDirWarning;
      apiPort = await spawned.portPromise;
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

    // TASK-1510 AC-1 — the adapter found no database where it was told to look, while
    // another location has one. Say so BEFORE the window opens showing an empty board,
    // because "silently empty" is the failure mode that makes someone think their data
    // is gone. Only the app can ask; the adapter can only warn to stderr.
    //
    // Non-blocking by design: the app still starts. An empty dir is legitimate on a
    // genuine first run, and refusing to boot because a directory exists elsewhere would
    // be worse than the bug. The dialog states the fix rather than performing it —
    // migrating a live database behind someone's back is not a decision to take for them.
    if (dataDirWarning?.text) {
      dialog.showMessageBoxSync({
        type: "warning",
        title: "Choda Companion — no data found here",
        message: "This install is starting with an empty database.",
        detail:
          `${dataDirWarning.text}\n\n` +
          `Currently reading: ${dataDir ?? "(adapter default)"}\n\n` +
          "Nothing has been deleted. To use the existing data, quit and set CHODA_DATA_DIR " +
          "to that folder, or link it — see docs/data-directory.md in the choda-deck repo.",
        buttons: ["Continue anyway"],
        noLink: true,
      });
    }

    // TASK-1503 — read the bridge token from the same data dir the adapter uses
    // and hand it to the proxy, so token-gated routes (POST /capture) work from
    // the web shell. Stays in the main process; never reaches the renderer.
    const bridgeToken = resolveBridgeToken({ dataDir });
    const uiServer = createStaticProxyServer({ staticDir, apiPort, bridgeToken });
    uiServer.listen(0, "127.0.0.1", () => {
      const { port: uiPort } = uiServer.address();
      console.log(`[electron] serving UI on http://127.0.0.1:${uiPort} (adapter on 127.0.0.1:${apiPort})`);
      const win = new BrowserWindow({
        width: 1280,
        height: 800,
        show: false, // show maximized once ready, to avoid a 1280×800 flash
        icon: appIcon,
        webPreferences: {
          // NFR Security — no devtools/remote debugging surface in production.
          devTools: !app.isPackaged,
          contextIsolation: true,
          nodeIntegration: false,
        },
      });
      // Open filling the screen (maximized, title bar kept) — the shell is
      // wide (boards, graph). ready-to-show avoids a small-then-grow flash.
      win.once("ready-to-show", () => {
        win.maximize();
        win.show();
      });
      win.loadURL(`http://127.0.0.1:${uiPort}/`);
      createTray();
    });

    app.on("before-quit", () => {
      adapterChild?.kill();
    });

    // Auto-update (private GitHub Releases). Packaged builds only — dev runs
    // have no app-update.yml and would just error immediately. Silent no-op
    // without a token (see updater.cjs) or in dev.
    if (app.isPackaged) {
      const { autoUpdater } = require("electron-updater");
      updater = initUpdater({
        autoUpdater,
        userDataDir: app.getPath("userData"),
        // Same surface as english-companion: a desktop notification + a
        // "Restart to update to vX" tray item. Falls back to install-on-quit if
        // the user ignores both (autoInstallOnAppQuit in updater.cjs).
        onUpdateReady: (info) => {
          setTrayMenu(info.version);
          new Notification({
            title: "Choda Companion update ready",
            body: `v${info.version} downloaded — restart from the tray menu to install.`,
            icon: appIcon,
          }).show();
        },
      });
    }
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
