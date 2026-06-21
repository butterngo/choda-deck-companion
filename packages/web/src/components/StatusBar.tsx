// TASK-1159 AC-2/AC-3 — the global liveness strip. Presentational: it renders
// purely from a HealthView, so tests drive it with mocked states. Never shows a
// fresh-looking "all good" when the API is down or the data is stale — the whole
// point of the companion is honest liveness.

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
        className="flex items-center gap-2 px-4 py-1.5 text-sm text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 hairline border-b border-rose-200 dark:border-rose-900"
      >
        <i className="ti ti-plug-connected-x" aria-hidden="true" />
        <span>Disconnected from laptop API — data may be unavailable.</span>
      </div>
    );
  }

  const loopAlive = health?.loopAlive === true;
  const dotClass = loopAlive
    ? "bg-emerald-500 live-dot"
    : "bg-zinc-400 dark:bg-zinc-600";

  return (
    <div
      role="status"
      aria-label="connection status"
      data-conn={conn}
      className="flex items-center gap-3 px-4 py-1.5 text-sm text-zinc-600 dark:text-zinc-300 tabstrip-shadow"
    >
      <span className="flex items-center gap-1.5">
        <span className={`inline-block w-2 h-2 rounded-full ${dotClass}`} aria-hidden="true" />
        <span>{loopAlive ? "sync loop live" : "loop down"}</span>
      </span>
      <span className="text-zinc-400">·</span>
      <span>
        last pull{" "}
        {health?.lastPullAgeSec != null ? `${health.lastPullAgeSec}s ago` : "—"}
      </span>
      <span className="text-zinc-400">·</span>
      <span className="mono text-xs">{loopLabel(health?.jwtState ?? "unknown")}</span>

      {conn === "stale" && (
        <span
          data-stale="true"
          className="ml-auto flex items-center gap-1.5 text-amber-700 dark:text-amber-400"
        >
          <i className="ti ti-clock-exclamation" aria-hidden="true" />
          may be stale — last fetched {lastFetchedAgoSec ?? "?"}s ago
        </span>
      )}
    </div>
  );
}
