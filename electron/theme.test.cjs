// TASK-2482 AC-5 — main applies only the three fixed modes. Every refusal
// asserts both the result AND that themeSource was left alone: a handler that
// applied the value and then reported failure would pass a result-only check.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createThemeHandler, fileStore, BACKGROUND } = require("./theme.cjs");

function harness({ stored = null, osDark = false } = {}) {
  let saved = stored;
  const nativeTheme = {
    themeSource: "system",
    get shouldUseDarkColors() {
      return this.themeSource === "dark" || (this.themeSource === "system" && osDark);
    },
  };
  const theme = createThemeHandler({
    nativeTheme,
    store: { get: () => saved, set: (m) => (saved = m) },
  });
  return { theme, nativeTheme, saved: () => saved };
}

describe("theme handler", () => {
  it.each(["system", "light", "dark"])("applies and persists %s", (mode) => {
    const h = harness();
    expect(h.theme.set(mode)).toEqual({ ok: true });
    expect(h.nativeTheme.themeSource).toBe(mode);
    expect(h.saved()).toBe(mode);
  });

  it.each([["Dark"], ["auto"], [""], [null], [undefined], [1], [{ mode: "dark" }]])(
    "refuses %j and leaves themeSource alone",
    (bad) => {
      const h = harness();
      h.theme.set("light");
      expect(h.theme.set(bad)).toEqual({ ok: false, reason: "unknown theme mode" });
      expect(h.nativeTheme.themeSource).toBe("light");
      expect(h.saved()).toBe("light");
    }
  );

  it("current() reports the applied mode for the page to boot from", () => {
    const h = harness({ stored: "dark" });
    h.theme.applyStored();
    expect(h.theme.current()).toBe("dark");
    h.theme.set("system");
    expect(h.theme.current()).toBe("system");
  });

  it("starts from the stored mode and returns the matching background", () => {
    const h = harness({ stored: "dark", osDark: false });
    expect(h.theme.applyStored()).toBe(BACKGROUND.dark);
    expect(h.nativeTheme.themeSource).toBe("dark");
  });

  it("falls back to system for a missing or tampered stored value", () => {
    for (const stored of [null, "purple"]) {
      const h = harness({ stored, osDark: true });
      expect(h.theme.applyStored()).toBe(BACKGROUND.dark);
      expect(h.nativeTheme.themeSource).toBe("system");
    }
    expect(harness({ stored: null, osDark: false }).theme.applyStored()).toBe(BACKGROUND.light);
  });
});

describe("theme fileStore", () => {
  it("round-trips the mode and reads a missing file as null", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "choda-theme-"));
    const store = fileStore(fs, path.join(dir, "theme.json"));
    expect(store.get()).toBeNull();
    store.set("dark");
    expect(store.get()).toBe("dark");
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
