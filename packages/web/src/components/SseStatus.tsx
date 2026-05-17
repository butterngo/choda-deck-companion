export type SseStatusValue = "connecting" | "open" | "closed";

export function SseStatus({ status }: { status: SseStatusValue }) {
  if (status === "open") return null;
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
