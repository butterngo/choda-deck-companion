// TASK-1614 — list rows show "when", and an ISO timestamp is not a thing you
// read at a glance. Shared so Knowledge, Vault and Conversations phrase it the
// same way rather than each inventing a format.
//
// Deliberately coarse: past only, no seconds, no "just now" jitter. These are
// notes and decisions, not a live feed — knowing something is "3d" old is the
// whole signal, and a rolling minute counter would only redraw the list.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/**
 * `2026-08-05` or an ISO timestamp → `3d`, `2w`, `4mo`.
 * Returns `""` for an unparseable or future date rather than guessing — a row
 * with no date reads better than a row claiming "in 3 days".
 */
export function relativeTime(value: string | null | undefined, now: number = Date.now()): string {
  if (!value) return "";
  const then = Date.parse(value);
  if (Number.isNaN(then)) return "";

  const delta = now - then;
  if (delta < 0) return "";
  if (delta < HOUR) return `${Math.max(1, Math.floor(delta / MINUTE))}m`;
  if (delta < DAY) return `${Math.floor(delta / HOUR)}h`;
  if (delta < WEEK) return `${Math.floor(delta / DAY)}d`;
  if (delta < 30 * DAY) return `${Math.floor(delta / WEEK)}w`;
  if (delta < 365 * DAY) return `${Math.floor(delta / (30 * DAY))}mo`;
  return `${Math.floor(delta / (365 * DAY))}y`;
}
