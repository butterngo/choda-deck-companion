// Quick-copy for the credentials each workspace keeps in `sensitive_information/`.
//
// Butter's rule (global CLAUDE.md): secrets live in `<project>/sensitive_information/`,
// git-ignored, referenced by path only. Getting one meant opening Explorer,
// finding the project, opening the file and selecting the value by hand.
//
// THE LIST CARRIES NAMES ONLY. The renderer gets workspace, file and key, and
// asks for a copy by name; this process re-reads the file, finds the value and
// writes the clipboard itself. A value crosses the bridge on exactly one path,
// `reveal`, which runs only when Butter clicks the eye icon on one entry.
//
// Built like open-html.cjs: the renderer never names a root. It sends a
// workspace id; the cwd is looked up HERE, from the adapter, and the file name
// must be a bare name inside `<cwd>/sensitive_information/`.
//
// A file is either KEY=VALUE lines (one entry per non-empty key, comments
// skipped) or a single bare value (one entry for the whole file).

const path = require("node:path");
const fs = require("node:fs");
const { isInside } = require("./open-folder.cjs");

const DIR_NAME = "sensitive_information";
const KV_LINE = /^\s*([A-Za-z0-9_.-]+)\s*=\s*(.*?)\s*$/;
const CLEAR_AFTER_MS = 45_000;

/**
 * Split a secrets file into named values. `key` is "" for a single-value file.
 *
 * @param {string} text
 * @returns {{ key: string, value: string }[]}
 */
function parseEntries(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "" && !l.trim().startsWith("#"));
  const kv = [];
  for (const line of lines) {
    const m = KV_LINE.exec(line);
    if (m && m[2] !== "") kv.push({ key: m[1], value: m[2] });
  }
  if (kv.length > 0) return kv;
  // Only comments and empty `key=` lines: an unfilled template, nothing to copy.
  if (lines.length === 0 || lines.every((l) => KV_LINE.test(l))) return [];
  return [{ key: "", value: lines.join("\n").trim() }];
}

/**
 * @param {{
 *   listWorkspaces: () => Promise<{ id: string, label?: string, cwd: string, archivedAt?: string | null }[]>,
 *   clipboard: { writeText: (t: string) => void, readText: () => string },
 *   readdirSync?: typeof fs.readdirSync,
 *   readFileSync?: typeof fs.readFileSync,
 *   setTimer?: (fn: () => void, ms: number) => unknown,
 * }} deps
 */
function createSecretsHandlers({
  listWorkspaces,
  clipboard,
  readdirSync = fs.readdirSync,
  readFileSync = fs.readFileSync,
  setTimer = (fn, ms) => setTimeout(fn, ms).unref?.(),
}) {
  /** Files in a workspace's secrets dir, or [] when it has none. */
  function filesIn(cwd) {
    try {
      return readdirSync(path.join(cwd, DIR_NAME), { withFileTypes: true })
        .filter((d) => d.isFile() && !/\.template\./i.test(d.name))
        .map((d) => d.name)
        .sort();
    } catch {
      return [];
    }
  }

  /** @returns {Promise<{ ok: true, entries: { workspaceId: string, workspaceLabel: string, file: string, key: string }[] } | { ok: false, reason: string }>} */
  async function list() {
    let workspaces;
    try {
      workspaces = await listWorkspaces();
    } catch {
      return { ok: false, reason: "adapter unreachable" };
    }
    const entries = [];
    // Several workspaces can share one cwd; the folder is listed once.
    const seen = new Set();
    for (const ws of workspaces) {
      if (!ws || typeof ws.cwd !== "string" || ws.cwd.trim() === "" || ws.archivedAt) continue;
      const root = path.resolve(ws.cwd).toLowerCase();
      if (seen.has(root)) continue;
      seen.add(root);
      for (const file of filesIn(ws.cwd)) {
        let text;
        try {
          text = readFileSync(path.join(ws.cwd, DIR_NAME, file), "utf8");
        } catch {
          continue;
        }
        for (const { key } of parseEntries(text)) {
          entries.push({ workspaceId: ws.id, workspaceLabel: ws.label || ws.id, file, key });
        }
      }
    }
    return { ok: true, entries };
  }

  /**
   * Look one value up by name. Every check lives here so copy and reveal
   * cannot drift apart.
   *
   * @returns {Promise<{ ok: true, value: string } | { ok: false, reason: string }>}
   */
  async function resolve(workspaceId, file, key) {
    if (typeof workspaceId !== "string" || workspaceId.trim() === "") {
      return { ok: false, reason: "invalid workspace" };
    }
    if (typeof file !== "string" || file === "" || path.basename(file) !== file || file === "..") {
      return { ok: false, reason: "invalid file" };
    }
    if (typeof key !== "string") return { ok: false, reason: "invalid key" };

    let ws;
    try {
      ws = (await listWorkspaces()).find((w) => w && w.id === workspaceId);
    } catch {
      return { ok: false, reason: "adapter unreachable" };
    }
    if (!ws || typeof ws.cwd !== "string") return { ok: false, reason: "unknown workspace" };

    const dir = path.resolve(ws.cwd, DIR_NAME);
    const target = path.resolve(dir, file);
    if (!isInside(dir, target) || target === dir) return { ok: false, reason: "outside the folder" };

    let text;
    try {
      text = readFileSync(target, "utf8");
    } catch {
      return { ok: false, reason: "not found" };
    }
    const hit = parseEntries(text).find((e) => e.key === key);
    return hit ? { ok: true, value: hit.value } : { ok: false, reason: "key not found" };
  }

  /** @returns {Promise<{ ok: boolean, reason?: string, clearsInSeconds?: number }>} */
  async function copy(workspaceId, file, key) {
    const hit = await resolve(workspaceId, file, key);
    if (!hit.ok) return hit;

    clipboard.writeText(hit.value);
    // Clear it again, but only if nothing else was copied meanwhile.
    setTimer(() => {
      try {
        if (clipboard.readText() === hit.value) clipboard.writeText("");
      } catch {
        // Clipboard busy — leaving it is harmless.
      }
    }, CLEAR_AFTER_MS);
    return { ok: true, clearsInSeconds: CLEAR_AFTER_MS / 1000 };
  }

  /**
   * The one path on which a value crosses to the renderer: an explicit click on
   * the eye icon. The renderer shows it briefly and drops it; nothing caches it.
   *
   * @returns {Promise<{ ok: true, value: string } | { ok: false, reason: string }>}
   */
  function reveal(workspaceId, file, key) {
    return resolve(workspaceId, file, key);
  }

  return { list, copy, reveal };
}

/**
 * GET /workspaces with the bridge token, which never leaves this process.
 *
 * @param {{ apiPort: number, bridgeToken: string | null | undefined, fetchImpl?: typeof fetch }} deps
 */
function workspaceLister({ apiPort, bridgeToken, fetchImpl = fetch }) {
  return async function listWorkspaces() {
    const res = await fetchImpl(`http://127.0.0.1:${apiPort}/workspaces`, {
      headers: bridgeToken ? { "x-choda-bridge-token": bridgeToken } : {},
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    return Array.isArray(body?.workspaces) ? body.workspaces : [];
  };
}

module.exports = { createSecretsHandlers, parseEntries, workspaceLister };
