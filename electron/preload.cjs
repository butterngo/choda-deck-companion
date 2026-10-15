// TASK-2050 — the renderer's only bridge to the main process.
//
// The window is built with contextIsolation on and nodeIntegration off, and
// until now carried no preload at all: the renderer could not reach main, which
// is the safest possible state and the one to leave as intact as possible.
//
// So this exposes a FIXED set of functions and nothing else — openFolder
// (TASK-2050), openHtml (TASK-2145) and the secrets pair, one channel each. No ipcRenderer, no `require`,
// no generic invoke — a renderer that could call an arbitrary channel would
// have the whole main process, and the whole point of the guard in
// open-folder.cjs is that the renderer is not trusted.
//
// `openFolder` returns a result object rather than throwing, because "refused"
// is an ordinary outcome here, not an exception.

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("choda", {
  /**
   * Ask the main process to open a folder in the OS file manager.
   *
   * The path is RELATIVE TO THE VAULT — the renderer never names a root. The
   * main process joins it onto the vault directory it was configured with and
   * refuses anything that walks back out. An absolute path is refused outright.
   *
   * @param {string} relativePath e.g. "vault/10-Projects/mantu/meetings/2026-09-20-kate"
   * @returns {Promise<{ ok: boolean, reason?: string }>}
   */
  openFolder: (relativePath) => ipcRenderer.invoke("choda:open-folder", relativePath),

  /**
   * TASK-2145 — ask the main process to open a workspace .html report in the
   * default browser. The workspace's root is looked up by the main process; the
   * path is relative to it, and anything but an .html/.htm file is refused.
   *
   * @param {string} workspaceId
   * @param {string} relativePath e.g. "docs/reports/smoke/report.html"
   * @returns {Promise<{ ok: boolean, reason?: string }>}
   */
  openHtml: (workspaceId, relativePath) =>
    ipcRenderer.invoke("choda:open-html", workspaceId, relativePath),

  /**
   * Which workspaces have credentials, and the file names in each. A folder
   * listing only — no file is opened, no value is included.
   *
   * @returns {Promise<{ ok: boolean, reason?: string, workspaces?: { workspaceId: string, workspaceLabel: string, files: string[] }[] }>}
   */
  listSecretFiles: () => ipcRenderer.invoke("choda:list-secret-files"),

  /**
   * The entry names (file + key) inside one workspace's credential files —
   * read when its group is opened. No values.
   *
   * @param {string} workspaceId
   * @returns {Promise<{ ok: boolean, reason?: string, entries?: { workspaceId: string, workspaceLabel: string, file: string, key: string }[] }>}
   */
  listSecrets: (workspaceId) => ipcRenderer.invoke("choda:list-secrets", workspaceId),

  /**
   * Copy one credential to the clipboard. The main process reads the value and
   * writes the clipboard itself, then clears it after a short delay.
   *
   * @param {string} workspaceId
   * @param {string} file bare file name inside `sensitive_information/`
   * @param {string} key "" for a single-value file
   * @returns {Promise<{ ok: boolean, reason?: string, clearsInSeconds?: number }>}
   */
  copySecret: (workspaceId, file, key) =>
    ipcRenderer.invoke("choda:copy-secret", workspaceId, file, key),

  /**
   * Return one credential's value so the UI can show it briefly. The only call
   * that brings a value across this bridge; the UI calls it on an explicit
   * click and never caches the result.
   *
   * @param {string} workspaceId
   * @param {string} file
   * @param {string} key
   * @returns {Promise<{ ok: boolean, reason?: string, value?: string }>}
   */
  revealSecret: (workspaceId, file, key) =>
    ipcRenderer.invoke("choda:reveal-secret", workspaceId, file, key),
});
