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

export function statusClass(status: string): string {
  switch (status.toLowerCase()) {
    case "finished":
    case "done":
      return "text-green-600 dark:text-green-400";
    case "running":
    case "in-progress":
      return "text-blue-600 dark:text-blue-400";
    case "failed":
      return "text-red-600 dark:text-red-400";
    case "cancelled":
      return "text-zinc-400";
    default:
      return "text-zinc-500";
  }
}

export function statusIcon(status: string): string {
  switch (status.toLowerCase()) {
    case "finished":
    case "done":
      return "ti-check";
    case "running":
    case "in-progress":
      return "ti-loader-2 spin";
    case "failed":
      return "ti-x";
    case "cancelled":
      return "ti-ban";
    default:
      return "ti-circle";
  }
}
