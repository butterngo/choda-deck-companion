export type SseStatusValue = "connecting" | "open" | "closed";

/**
 * Connected → 6px emerald `.live-dot` (silent confidence per spec S1).
 * Connecting / closed → `ti-refresh` spinning (silent retry per spec S2).
 */
export function SseStatus({ status }: { status: SseStatusValue }) {
  if (status === "open") {
    return (
      <span
        className="live-dot inline-block w-1.5 h-1.5 rounded-full bg-emerald-500"
        title="Live event stream connected"
        aria-label="Live event stream connected"
      />
    );
  }
  const title =
    status === "connecting"
      ? "Connecting to live event stream…"
      : "Live event stream disconnected — reconnecting…";
  return (
    <span
      className="inline-flex items-center gap-1 text-[12px]"
      title={title}
      aria-label={title}
    >
      <i className="ti ti-refresh spin" aria-hidden="true" />
    </span>
  );
}
