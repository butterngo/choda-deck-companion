// TASK-1159 AC-2/AC-3 — the global liveness strip. Presentational: it renders
// purely from a HealthView, so tests drive it with mocked states. Never shows a
// fresh-looking "all good" when the API is down or the data is stale — the whole
// point of the companion is honest liveness.
//
// TASK-1595 — relaid out as a compact vertical stack. It moved from a full-width
// strip across the app to the foot of a 216px sidebar, where a single row of
// dot-separated spans would overflow. Every string is unchanged; only the
// arrangement moved, which is why the four existing tests still pass untouched.

import type { HealthView } from "../hooks/use-health";

function loopLabel(jwtState: string): string {
  switch (jwtState) {
    case "refresh":
      return "token: auto-refresh";
    case "static":
      return "token: static";
    case "none":
      return "token: none";
    default:
      return "token: unknown";
  }
}

export function StatusBar({ view }: { view: HealthView }): React.JSX.Element {
  const { health, conn, lastFetchedAgoSec } = view;

  if (conn === "disconnected") {
    return (
      <div
        role="status"
        aria-label="connection status"
        data-conn="disconnected"
        className="flex items-start gap-2 px-3 py-2 text-xs leading-relaxed text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40"
      >
        <i className="ti ti-plug-connected-x mt-px" aria-hidden="true" />
        <span>Disconnected from laptop API — data may be unavailable.</span>
      </div>
    );
  }

  const loopAlive = health?.loopAlive === true;
  const dotClass = loopAlive ? "bg-emerald-500 live-dot" : "bg-zinc-400 dark:bg-zinc-600";

  return (
    <div
      role="status"
      aria-label="connection status"
      data-conn={conn}
      className="flex flex-col gap-1 px-3 py-2 text-xs text-zinc-600 dark:text-zinc-300"
    >
      <span className="flex items-center gap-1.5">
        <span className={`inline-block w-1.5 h-1.5 rounded-full ${dotClass}`} aria-hidden="true" />
        <span>{loopAlive ? "sync loop live" : "loop down"}</span>
      </span>
      <span className="text-zinc-500 dark:text-zinc-400 tabular-nums">
        last pull {health?.lastPullAgeSec != null ? `${health.lastPullAgeSec}s ago` : "—"}
      </span>
      <span className="mono text-[11px] text-zinc-400">{loopLabel(health?.jwtState ?? "unknown")}</span>

      {conn === "stale" && (
        <span
          data-stale="true"
          className="flex items-start gap-1.5 leading-relaxed text-amber-700 dark:text-amber-400"
        >
          <i className="ti ti-clock-exclamation mt-px" aria-hidden="true" />
          <span>may be stale — last fetched {lastFetchedAgoSec ?? "?"}s ago</span>
        </span>
      )}
    </div>
  );
}
