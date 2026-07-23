// TASK-1439 — native auto-start-at-login, replacing the Task Scheduler
// AtLogOn launcher. Decision (spike, resolved): Electron's own
// app.setLoginItemSettings() over an NSIS Run-key installer option — it's
// cross-platform, needs no installer-script coupling, and is the exact
// mechanism english-companion already uses (its own TASK-1369). Per-user (not
// per-machine) registration, matching that precedent — a shared machine gets
// one entry per Windows account, not a single machine-wide one.
//
// Registered with an explicit `name` so the resulting registry Run-key value
// name is deterministic and the uninstall cleanup (build/installer.nsh) can
// target it exactly, rather than guessing at whatever Electron derives from
// productName/appId by default.
const LOGIN_ITEM_NAME = "Choda Companion";

// Idempotent — safe to call on every launch. Electron reads the current OS
// state back rather than us persisting a flag (mirrors english-companion's
// own comment on this), so drift can't happen; setting the same value twice
// is a harmless no-op.
function configureLoginItem({ app, isPackaged }) {
  if (!isPackaged) return null; // dev runs would register "electron.exe ." — never do that
  app.setLoginItemSettings({ openAtLogin: true, name: LOGIN_ITEM_NAME });
  return app.getLoginItemSettings({ name: LOGIN_ITEM_NAME });
}

module.exports = { configureLoginItem, LOGIN_ITEM_NAME };
