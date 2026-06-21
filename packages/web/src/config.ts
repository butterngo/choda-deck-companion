// TASK-1159 AC-1 — the companion talks to EXACTLY ONE API: the laptop REST
// adapter, reached same-origin via the `/api` dev proxy (vite.config.ts) or a
// reverse proxy in prod. There is intentionally no remote/OAuth base here — the
// laptop's sync engine owns laptop↔remote, and no credential ever reaches the
// browser. The companion-web-shell test asserts no `mcp.choda.dev` reference
// exists anywhere in src, so this stays the only API surface.

export const API_BASE = "/api";

// The remote pod must never be addressed from web code. Exported so a test can
// assert it and so any accidental future use is a visible, named violation.
export const FORBIDDEN_REMOTE_HOST = "mcp.choda.dev";
