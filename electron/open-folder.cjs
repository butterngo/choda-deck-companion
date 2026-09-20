// TASK-2050 — open a folder in the OS file manager.
//
// This is the app's FIRST hand-off from the renderer to the operating system.
// Until now nothing here called shell.openPath, shell.showItemInFolder or
// shell.openExternal, and the window was built with contextIsolation on,
// nodeIntegration off and no preload at all — the renderer had no bridge.
//
// So the guard is the point, not the feature.
//
// THE RENDERER NEVER NAMES A ROOT. It sends a path RELATIVE to the vault, and
// this process joins it onto the vault directory it was configured with. The
// first version of this took an absolute path and checked it against a list of
// allowed roots; relative-plus-owned-root is strictly better, because "is this
// absolute path allowed?" is a question that can be got wrong, while "join this
// onto my own root" has no equivalent mistake. (It was also, as written, broken:
// the UI's path is `vault/10-Projects/…`, which is not absolute and would have
// resolved against the Electron process's cwd.)
//
// After the join the result is still checked to be inside the root, because a
// relative path can carry `..` and walk back out of it.
//
// Directories only. shell.openPath on an .exe or a .bat RUNS it, so a handler
// that opened files would be a remote launcher wearing a folder's name.
//
// With no vault configured nothing opens. Fail-closed is the right default for
// a feature whose worst case is executing someone else's file.

const path = require("node:path");
const fs = require("node:fs");

/**
 * Is `target` the same as `root`, or inside it?
 *
 * Compares RESOLVED paths and requires a real path step below the root, so
 * `C:\vault-evil` is not treated as living inside `C:\vault` just because the
 * one is a string prefix of the other.
 */
function isInside(root, target) {
  const rel = path.relative(root, target);
  if (rel === "") return true;
  if (rel.startsWith("..")) return false;
  // An absolute `rel` means the two are on different drives.
  return !path.isAbsolute(rel);
}

/**
 * The UI shows vault paths as `vault/10-Projects/…` — the leading segment is a
 * label for the vault itself, not a directory inside it. Strip it so the rest
 * can be joined onto the real root.
 */
function stripVaultPrefix(rel) {
  // Trailing separator OR end of string: `vault/10-Projects/x` and a bare
  // `vault` both name the root. Only a WHOLE segment is stripped, so a folder
  // called `vaults` is left alone.
  return rel.replace(/^[\\/]*vault(?:[\\/]+|$)/i, "");
}

/**
 * Build the open-folder handler.
 *
 * @param {{
 *   shell: { openPath: (p: string) => Promise<string> },
 *   vaultDir?: string,
 *   statSync?: (p: string) => { isDirectory: () => boolean }
 * }} deps
 * @returns {(relativePath: unknown) => Promise<{ ok: boolean, reason?: string }>}
 */
function createOpenFolderHandler({ shell, vaultDir, statSync = fs.statSync }) {
  // Resolved once, here, from what THIS process was configured with. The
  // handler closes over it; nothing in a request can add to or replace it.
  const root =
    typeof vaultDir === "string" && vaultDir.trim().length > 0 ? path.resolve(vaultDir) : null;

  return async function openFolder(relativePath) {
    if (typeof relativePath !== "string" || relativePath.trim().length === 0) {
      return { ok: false, reason: "invalid path" };
    }
    if (root === null) {
      return { ok: false, reason: "no vault configured" };
    }
    // An absolute path is refused outright rather than checked. The contract is
    // "relative to the vault"; accepting an absolute one would quietly restore
    // the weaker design this replaced.
    if (path.isAbsolute(relativePath) || /^[a-z]:/i.test(relativePath)) {
      return { ok: false, reason: "path must be relative to the vault" };
    }

    const target = path.resolve(root, stripVaultPrefix(relativePath));
    // Checked AFTER the join: a relative path can carry `..` and walk out.
    if (!isInside(root, target)) {
      return { ok: false, reason: "outside the vault" };
    }

    let isDir = false;
    try {
      isDir = statSync(target).isDirectory();
    } catch {
      return { ok: false, reason: "not found" };
    }
    if (!isDir) return { ok: false, reason: "not a directory" };

    const err = await shell.openPath(target);
    // openPath resolves with an ERROR STRING, empty when it worked — an unusual
    // contract that is easy to read backwards.
    return err ? { ok: false, reason: err } : { ok: true };
  };
}

module.exports = { createOpenFolderHandler, isInside, stripVaultPrefix };
