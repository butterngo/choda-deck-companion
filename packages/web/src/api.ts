// TASK-1159 — thin fetch client over the laptop REST adapter (TASK-1158).
// Reads only; the shell needs /sync/health for the status bar. Later pillar
// screens add /sync/ledger, /workflow/focus, /knowledge, etc. against this same
// single base.

import { API_BASE } from "./config";

// Mirror of the adapter's GET /sync/health payload (src/adapters/companion).
export interface SyncHealth {
  loopAlive: boolean;
  lastPullAgeSec: number | null;
  jwtState: "refresh" | "static" | "none" | "unknown";
  reachable: boolean;
}

// One row of the sync ledger — mirror of the adapter's GET /sync/ledger entries
// (src/adapters/companion/sync-ledger). Every local row of an entity falls into
// exactly one bucket (precedence: tombstoned > remote-only > in-sync > local-only).
export interface LedgerRow {
  entity: string;
  inSync: number;
  localOnly: number;
  remoteOnly: number;
  tombstoned: number;
}

// Result of a Pull/Push action (POST /sync/pull|push, TASK-1175). Shape is
// permissive — the adapter may return a flat count or per-table detail.
export interface SyncActionResult {
  upserted?: number;
  tombstoned?: number;
  pushed?: number;
  message?: string;
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
  return (await res.json()) as T;
}

async function postJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { method: "POST" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
  return (await res.json()) as T;
}

export function fetchHealth(signal?: AbortSignal): Promise<SyncHealth> {
  return getJson<SyncHealth>("/sync/health", signal);
}

export function fetchLedger(signal?: AbortSignal): Promise<{ ledger: LedgerRow[] }> {
  return getJson<{ ledger: LedgerRow[] }>("/sync/ledger", signal);
}

// Pull/Push wire to the adapter's mutation endpoints (TASK-1175). They 404 until
// that lands; the UI surfaces the error rather than pretending success.
export function pullSync(): Promise<SyncActionResult> {
  return postJson<SyncActionResult>("/sync/pull");
}

export function pushSync(): Promise<SyncActionResult> {
  return postJson<SyncActionResult>("/sync/push");
}
