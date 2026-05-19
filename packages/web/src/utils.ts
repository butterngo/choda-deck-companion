/** Ported from packages/server/src/static/index.html helper block. */

export function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatCost(usd: number | undefined | null): string {
  if (usd == null || !Number.isFinite(usd)) return "—";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

export function formatDuration(ms: number | undefined | null): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "—";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return `${m}m ${rem}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "—";
  const delta = (Date.now() - then) / 1000;
  if (delta < 60) return `${Math.round(delta)}s ago`;
  if (delta < 3600) return `${Math.round(delta / 60)}m ago`;
  if (delta < 86400) return `${Math.round(delta / 3600)}h ago`;
  return `${Math.round(delta / 86400)}d ago`;
}

/**
 * v2 status palette — see docs/handoff-design/project/uploads/00-product-overview.md.
 * DONE emerald / FAILED rose / IN-PROGRESS amber / READY sky / TODO zinc-500 / CANCELLED zinc-400.
 */
export function statusClass(status: string): string {
  switch (status.toLowerCase()) {
    case "finished":
    case "done":
      return "text-emerald-600 dark:text-emerald-400";
    case "running":
    case "in-progress":
      return "text-amber-600 dark:text-amber-400";
    case "failed":
      return "text-rose-600 dark:text-rose-400";
    case "ready":
      return "text-sky-600 dark:text-sky-400";
    case "cancelled":
      return "text-zinc-400 dark:text-zinc-500";
    case "todo":
    default:
      return "text-zinc-500 dark:text-zinc-400";
  }
}

export function statusIcon(status: string): string {
  switch (status.toLowerCase()) {
    case "finished":
    case "done":
      return "ti-circle-check";
    case "running":
    case "in-progress":
      return "ti-progress spin";
    case "failed":
      return "ti-circle-x";
    case "ready":
      return "ti-player-play";
    case "cancelled":
      return "ti-circle-minus";
    case "todo":
    default:
      return "ti-circle";
  }
}
