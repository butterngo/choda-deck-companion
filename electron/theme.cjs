// TASK-2482 — the window follows the theme chosen in the sidebar foot.
//
// The page applies its own `.dark` class (packages/web/index.html boot script +
// use-theme). What the page cannot reach is the native chrome: the title bar
// and the window background behind the first paint. Both follow
// `nativeTheme.themeSource`, which only the main process can set.
//
// The renderer sends one of three fixed modes over one fixed channel
// (preload.cjs `setTheme`); anything else is refused, never coerced. The choice
// is also written to a small file in userData, because at the next launch the
// BrowserWindow is created before the page has run — and its backgroundColor
// is what shows until the first paint.

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
