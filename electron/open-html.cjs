// TASK-2145 — open a workspace .html report in the default browser.
//
// The Docs pane renders a report in <iframe sandbox="">, with no scripts
// (TASK-1956). That is right for reading inside the app, but a report's own
// JavaScript — a lightbox, a filter, a chart — only runs when the file is opened
// as itself. This is the second hand-off from the renderer to the operating
// system, and it is built exactly like the first (open-folder.cjs, TASK-2050):
//
//  · THE RENDERER NEVER NAMES A ROOT. It sends a workspace id and a path
//    relative to that workspace. The root is looked up HERE, from the adapter,
//    with the bridge token this process holds; the renderer cannot supply one.
//  · After the join the result must still be inside the root: a relative path
//    can carry `..`.
//  · .html and .htm ONLY, checked on the resolved target. openExternal on a
//    file:// URL hands it to whatever the OS associates with the extension —
//    for an .exe or a .bat that is "run it". The extension allowlist is what
//    keeps this a browser opener and not a launcher.
//  · A regular file that exists. A directory named `x.html` is refused.
//
// Every refusal is a result, not a throw, and nothing reaches the shell unless
// every check passed.

const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");
const { isInside } = require("./open-folder.cjs");

const HTML_EXT = new Set([".html", ".htm"]);

/**
 * Build the open-html handler.
 *
 * @param {{
 *   shell: { openExternal: (url: string) => Promise<void> },
 *   resolveWorkspaceCwd: (workspaceId: string) => Promise<string | null>,
 *   statSync?: (p: string) => { isFile: () => boolean }
 * }} deps
 * @returns {(workspaceId: unknown, relPath: unknown) => Promise<{ ok: boolean, reason?: string }>}
 */
function createOpenHtmlHandler({ shell, resolveWorkspaceCwd, statSync = fs.statSync }) {
  return async function openHtml(workspaceId, relPath) {
    if (typeof workspaceId !== "string" || workspaceId.trim().length === 0) {
      return { ok: false, reason: "invalid workspace" };
    }
    if (typeof relPath !== "string" || relPath.trim().length === 0) {
      return { ok: false, reason: "invalid path" };
    }
    // Refused rather than checked: the contract is "relative to the workspace".
    if (path.isAbsolute(relPath) || /^[a-z]:/i.test(relPath)) {
      return { ok: false, reason: "path must be relative to the workspace" };
    }

    let cwd = null;
    try {
      cwd = await resolveWorkspaceCwd(workspaceId);
    } catch {
      cwd = null;
    }
    if (typeof cwd !== "string" || cwd.trim().length === 0) {
      return { ok: false, reason: "unknown workspace" };
    }

    const root = path.resolve(cwd);
    const target = path.resolve(root, relPath);
    if (!isInside(root, target) || target === root) {
      return { ok: false, reason: "outside the workspace" };
    }
    // On the RESOLVED target, so `report.html/../payload.bat` cannot pass on
    // the string it arrived as.
    if (!HTML_EXT.has(path.extname(target).toLowerCase())) {
      return { ok: false, reason: "only .html and .htm files open in the browser" };
    }

    let isFile = false;
    try {
      isFile = statSync(target).isFile();
    } catch {
      return { ok: false, reason: "not found" };
    }
    if (!isFile) return { ok: false, reason: "not a file" };

    try {
      await shell.openExternal(pathToFileURL(target).href);
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : "could not open" };
    }
  };
}

/**
 * Look a workspace's cwd up on the adapter. Lives here, in the main process,
 * because the bridge token does: the renderer never sees it.
 *
 * @param {{ apiPort: number, bridgeToken: string | null | undefined, fetchImpl?: typeof fetch }} deps
 * @returns {(workspaceId: string) => Promise<string | null>}
 */
function workspaceCwdResolver({ apiPort, bridgeToken, fetchImpl = fetch }) {
  return async function resolveWorkspaceCwd(workspaceId) {
    const res = await fetchImpl(`http://127.0.0.1:${apiPort}/workspaces`, {
      headers: bridgeToken ? { "x-choda-bridge-token": bridgeToken } : {},
    });
    if (!res.ok) return null;
    const body = await res.json();
    const list = Array.isArray(body?.workspaces) ? body.workspaces : [];
    const hit = list.find((w) => w && w.id === workspaceId);
    return hit && typeof hit.cwd === "string" ? hit.cwd : null;
  };
}

module.exports = { createOpenHtmlHandler, workspaceCwdResolver };
