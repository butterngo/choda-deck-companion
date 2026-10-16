// TASK-2482 smoke: drives the real Electron app (main.cjs + preload + built web)
// against an isolated DB copy. Flips the real Windows app theme and restores it.
const path = require("node:path");
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const REPO = "C:/dev/choda-deck-companion";
const { _electron } = require(path.join(REPO, "node_modules/.pnpm/playwright-core@1.64.0/node_modules/playwright-core"));
const S = __dirname;

const ps = (file, ...args) =>
  execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(S, file), ...args], { encoding: "utf8" }).trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${JSON.stringify(detail)}`); };

async function launch() {
  for (let attempt = 1; ; attempt++) {
    try { return await launchOnce(); } catch (e) { if (attempt >= 4) throw e; console.log(`launch retry ${attempt}: ${String(e.message).split(/\r?\n/)[0]}`); await sleep(5000); }
  }
}

async function launchOnce() {
  const app = await _electron.launch({
    executablePath: path.join(REPO, "node_modules/electron/dist/electron.exe"),
    args: [path.join(S, "wrapper")],
    cwd: REPO,
    env: {
      ...process.env,
      CHODA_DATA_DIR: path.join(S, "data"),
      // The sibling choda-deck checkout's better-sqlite3 is built for Node, not
      // Electron; the last packaged build's vendored adapter is built for Electron.
      CHODA_ADAPTER_ENTRY: path.join(REPO, "release/win-unpacked/resources/adapter/companion-server.cjs"),
      CHODA_ADAPTER_NODE_PATH: path.join(REPO, "release/win-unpacked/resources/adapter/node_modules"),
      CHODA_EMBEDDING_MODEL_DIR: path.join(REPO, "release/win-unpacked/resources/adapter/models"),
    },
    timeout: 120000,
  });
  const page = await app.firstWindow({ timeout: 120000 });
  // Capture the window state as early as possible, before the page settles.
  const early = await app.evaluate(({ BrowserWindow, nativeTheme }) => {
    const w = BrowserWindow.getAllWindows()[0];
    return { bg: w.getBackgroundColor(), themeSource: nativeTheme.themeSource, darkColors: nativeTheme.shouldUseDarkColors };
  });
  // Playwright emulates prefers-color-scheme: light by default; turn that off so
  // the page sees the real native theme, as it does outside the harness.
  await page.emulateMedia({ colorScheme: null });
  await page.waitForSelector('[data-testid="sidebar"]', { timeout: 120000 });
  return { app, page, early };
}

const state = (app, page) =>
  Promise.all([
    page.evaluate(() => ({ dark: document.documentElement.classList.contains("dark"), stored: localStorage.getItem("theme"), mq: matchMedia("(prefers-color-scheme: dark)").matches, checked: document.querySelector('[role=radio][aria-checked=true]')?.textContent ?? document.querySelector('[data-testid=theme-cycle]')?.getAttribute('aria-label') })),
    app.evaluate(({ nativeTheme }) => ({ themeSource: nativeTheme.themeSource, darkColors: nativeTheme.shouldUseDarkColors })),
  ]).then(([p, m]) => ({ ...p, ...m }));

async function titleBarColor(app) {
  const pt = await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    w.focus();
    const b = w.getBounds(), c = w.getContentBounds();
    return { x: c.x + Math.round(c.width / 3), y: Math.max(0, Math.round((Math.max(b.y, 0) + c.y) / 2)), b, c };
  });
  await sleep(600);
  return { color: ps("pixel.ps1", "-X", String(pt.x), "-Y", String(pt.y)), at: [pt.x, pt.y] };
}
const isDarkPixel = (hex) => parseInt(hex.slice(1, 3), 16) < 80;

async function pick(page, mode) {
  // Expand the sidebar so the radiogroup form is present.
  await page.evaluate(() => localStorage.setItem("sidebar-collapsed", "false"));
  const radio = page.getByRole("radio", { name: mode });
  if (!(await radio.count())) { await page.reload(); await page.waitForSelector('[data-testid="sidebar"]'); }
  await page.getByRole("radio", { name: mode }).click();
  await sleep(500);
}

(async () => {
  const osBefore = ps("os-theme.ps1", "-Mode", "light"); // start from a known OS state
  const userData = path.join(S, "userdata");
  try { fs.rmSync(path.join(userData, "theme.json")); } catch {}

  // 1. Fresh profile: Auto, follows OS (light)
  let { app, page, early } = await launch();
  await page.evaluate(() => { localStorage.removeItem("theme"); localStorage.setItem("sidebar-collapsed", "false"); });
  await page.reload(); await page.waitForSelector('[data-testid="sidebar"]');
  let s = await state(app, page);
  const autoChecked = await page.getByRole("radio", { name: "Auto" }).getAttribute("aria-checked");
  check("AC-1 fresh profile: Auto checked, light", autoChecked === "true" && !s.dark && s.stored === null, { autoChecked, ...s });
  let tb = await titleBarColor(app);
  check("smoke-1 title bar light in Auto+OS light", !isDarkPixel(tb.color), tb);

  // 2. Dark: page + title bar + persist
  await pick(page, "Dark");
  s = await state(app, page);
  check("AC-2 Dark applied + stored", s.dark && s.stored === "dark" && s.themeSource === "dark", s);
  tb = await titleBarColor(app);
  check("AC-5 title bar dark after choosing Dark", isDarkPixel(tb.color), tb);

  // AC-5 refusal over the real bridge
  const refused = await page.evaluate(() => window.choda.setTheme("purple"));
  s = await state(app, page);
  check("AC-5 main refuses an unknown mode", refused.ok === false && s.themeSource === "dark", { refused, themeSource: s.themeSource });

  // 3. Restart: dark before first paint
  await app.close();
  await sleep(4000);
  ({ app, page, early } = await launch());
  const persisted = JSON.parse(fs.readFileSync(path.join(userData, "theme.json"), "utf8"));
  s = await state(app, page);
  check("AC-3 restart: window bg dark from creation, Dark kept and checked", early.bg.toLowerCase() === "#18181b" && early.themeSource === "dark" && persisted.mode === "dark" && s.dark && /^(Dark|Theme: Dark\.)/.test(s.checked), { early, persisted, ...s });
  // Was .dark already on <html> when the parser reached the app's module script
  // (i.e. before React could render anything)? Recorded by an init script.
  await page.addInitScript(() => {
    new MutationObserver((_, obs) => {
      if (document.querySelector('script[type="module"]')) {
        window.__darkAtModule = document.documentElement.classList.contains("dark");
        obs.disconnect();
      }
    }).observe(document, { childList: true, subtree: true });
  });
  await page.reload(); await page.waitForSelector('[data-testid="sidebar"]');
  const atModule = await page.evaluate(() => window.__darkAtModule);
  check("AC-3 boot script applies dark before the app's first script", atModule === true, { atModule });

  // 4. Auto follows a real Windows change, live
  await pick(page, "Auto");
  s = await state(app, page);
  check("AC-2 Auto removes key, applies OS (light)", s.stored === null && !s.dark && s.themeSource === "system", s);
  ps("os-theme.ps1", "-Mode", "dark"); await sleep(2500);
  s = await state(app, page); tb = await titleBarColor(app);
  check("AC-4 Auto: Windows → dark flips app live", s.dark && s.darkColors && isDarkPixel(tb.color), { ...s, tb });
  ps("os-theme.ps1", "-Mode", "light"); await sleep(2500);
  s = await state(app, page); tb = await titleBarColor(app);
  check("AC-4 Auto: Windows → light flips back", !s.dark && !s.darkColors && !isDarkPixel(tb.color), { ...s, tb });

  // 5. Light ignores the OS
  await pick(page, "Light");
  ps("os-theme.ps1", "-Mode", "dark"); await sleep(2500);
  s = await state(app, page); tb = await titleBarColor(app);
  check("AC-4 Light: Windows → dark is ignored", !s.dark && !s.darkColors && !isDarkPixel(tb.color), { ...s, tb });
  ps("os-theme.ps1", "-Mode", "light"); await sleep(1500);

  // 6. Collapsed rail cycles
  await page.evaluate(() => localStorage.setItem("sidebar-collapsed", "true"));
  await page.reload(); await page.waitForSelector('[data-testid="theme-cycle"]');
  const names = [];
  for (let i = 0; i < 3; i++) { names.push(await page.getByTestId("theme-cycle").getAttribute("aria-label")); await page.getByTestId("theme-cycle").click(); await sleep(300); }
  names.push(await page.getByTestId("theme-cycle").getAttribute("aria-label"));
  check("AC-7 rail cycles Light → Dark → Auto → Light", /^Theme: Light/.test(names[0]) && /^Theme: Dark/.test(names[1]) && /^Theme: Auto/.test(names[2]) && /^Theme: Light/.test(names[3]), names);
  await page.screenshot({ path: path.join(S, "smoke-final.png") });

  // leave the dev profile on Auto
  await page.evaluate(() => { localStorage.removeItem("theme"); });
  await app.close();
  console.log(`restored ${ps("os-theme.ps1", "-Mode", "light")} (was light before: ${osBefore})`);
  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`);
  process.exit(results.every((r) => r.ok) ? 0 : 1);
})().catch((e) => { console.error(e); try { ps("os-theme.ps1", "-Mode", "light"); } catch {} process.exit(2); });
