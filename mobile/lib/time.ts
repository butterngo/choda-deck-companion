// Relative time per design system spec.
// Thresholds: <60s "just now", <60m "Xm ago", <24h "Xh ago", <2d "yesterday",
// <7d "Xd ago", >=7d absolute YYYY-MM-DD.

export function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (isNaN(then)) return iso;
  const diffMs = Date.now() - then;
  if (diffMs < 0) return 'just now';

  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return 'just now';

  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;

  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;

  const day = Math.floor(hr / 24);
  if (day < 2) return 'yesterday';
  if (day < 7) return `${day}d ago`;

  const d = new Date(then);
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = String(s % 60).padStart(2, '0');
  return `${m}m ${rs}s`;
}
