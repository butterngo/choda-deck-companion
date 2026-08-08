// TASK-1160 — the Sync Observatory: the v1 payoff that answers "what's synced 2
// ways?". Per-entity ledger + Pull/Push, sitting under the shell's health strip.
// Honest liveness (AC-2): when the connection is down it shows that, never a
// stale "all synced" ledger.
//
// TASK-1596 — moved onto the shared state components, and the disconnected /
// query-failed branches split apart. They previously shared one message, which
// is exactly the conflation ADR-028 forbids: "can't reach the laptop" and "the
// ledger query failed" call for different reactions.

import { useOutletContext } from "react-router-dom";
import type { HealthView } from "../hooks/use-health";
import { useLedger } from "../hooks/use-ledger";
import { useSyncLog } from "../hooks/use-sync-log";
import { LedgerTable } from "../components/LedgerTable";
import { SyncActions } from "../components/SyncActions";
import { SyncLogFeed } from "../components/SyncLogFeed";
import { Skeleton } from "../components/state/Skeleton";
import { ErrorState } from "../components/state/ErrorState";

export function SyncView(): React.JSX.Element {
  const health = useOutletContext<HealthView>();
  const ledger = useLedger();
  const syncLog = useSyncLog();

  const refetchAll = (): void => {
    ledger.refetch();
    syncLog.refetch();
  };

  function body(): React.JSX.Element {
    if (health.conn === "disconnected") {
      return (
        <ErrorState
          variant="unreachable"
          description="The ledger is unavailable — this is not “all synced”."
        />
      );
    }
    if (ledger.isError) {
      return (
        <ErrorState
          variant="failed"
          subject="the sync ledger"
          action={
            <button
              type="button"
              onClick={refetchAll}
              className="px-3 py-1.5 rounded-md text-sm border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              Try again
            </button>
          }
        />
      );
    }
    if (ledger.isLoading) return <Skeleton shape="card" label="Loading ledger…" />;

    return (
      <>
        <LedgerTable rows={ledger.rows} />
        <p className="mt-3 text-xs text-zinc-400">
          Counts are the laptop’s view, from each row’s sync origin + stamp.{" "}
          {health.conn === "stale" && "Possibly stale — see the status bar."}
        </p>
        <SyncLogFeed
          events={syncLog.events}
          isLoading={syncLog.isLoading}
          isError={syncLog.isError}
        />
      </>
    );
  }

  return (
    <section aria-label="sync observatory">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-medium">Sync Observatory</h1>
        <SyncActions onDone={refetchAll} />
      </div>
      {body()}
    </section>
  );
}
