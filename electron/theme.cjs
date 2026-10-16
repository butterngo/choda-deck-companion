// TASK-2482 — the window follows the theme chosen in the sidebar foot.
//
// The page applies its own `.dark` class (packages/web/index.html boot script +
// use-theme). What the page cannot reach is the native chrome: the title bar
// and the window background behind the first paint. Both follow
// `nativeTheme.themeSource`, which only the main process can set.
//
// The renderer sends one of three fixed modes over one fixed channel
// (preload.cjs `setTheme`); anything else is refused, never coerced. The choice
// is written to a small file in userData, and THAT file is the source of truth
// in the packaged app, not localStorage: the UI is served from 127.0.0.1 on a
// fresh port every launch, so each launch is a new origin with an empty
// localStorage. The page reads the mode back through preload `getTheme` before
// first paint. The file also gives the BrowserWindow its backgroundColor, which
// is what shows until that first paint.

const MODES = ["system", "light", "dark"];

/** Must match the page background: `bg-white` / `dark:bg-zinc-900` on <body>. */
const BACKGROUND = { light: "#ffffff", dark: "#18181b" };

function isMode(value) {
  return typeof value === "string" && MODES.includes(value);
}

function createThemeHandler({ nativeTheme, store }) {
  return {
    /** Apply the stored mode before the window exists. Returns its backgroundColor. */
    applyStored() {
      const stored = store.get();
      nativeTheme.themeSource = isMode(stored) ? stored : "system";
      return nativeTheme.shouldUseDarkColors ? BACKGROUND.dark : BACKGROUND.light;
    },

    /** The mode main is applying now — what the page boots from (preload getTheme). */
    current() {
      return isMode(nativeTheme.themeSource) ? nativeTheme.themeSource : "system";
    },

    /** The IPC handler body: validate, apply, persist. */
    set(mode) {
      if (!isMode(mode)) return { ok: false, reason: "unknown theme mode" };
      nativeTheme.themeSource = mode;
      store.set(mode);
      return { ok: true };
    },
  };
}

function fileStore(fs, file) {
  return {
    get() {
      try {
        return JSON.parse(fs.readFileSync(file, "utf8")).mode ?? null;
      } catch {
        return null;
      }
    },
    set(mode) {
      try {
        fs.writeFileSync(file, JSON.stringify({ mode }));
      } catch {
        // A failed write only means the next launch starts from the OS theme.
      }
    },
  };
}

module.exports = { createThemeHandler, fileStore, MODES, BACKGROUND };
