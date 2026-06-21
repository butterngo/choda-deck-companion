// TASK-1160 — the Sync Observatory: the v1 payoff that answers "what's synced 2
// ways?". Per-entity ledger + Pull/Push, sitting under the shell's health strip.
// Honest liveness (AC-2): when the connection is down it shows that, never a
// stale "all synced" ledger.

import { useOutletContext } from "react-router-dom";
import type { HealthView } from "../hooks/use-health";
import { useLedger } from "../hooks/use-ledger";
import { LedgerTable } from "../components/LedgerTable";
import { SyncActions } from "../components/SyncActions";

export function SyncView(): React.JSX.Element {
  const health = useOutletContext<HealthView>();
  const ledger = useLedger();

  return (
    <section aria-label="sync observatory">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-lg font-medium">Sync Observatory</h1>
        <SyncActions onDone={ledger.refetch} />
      </div>

      {health.conn === "disconnected" || ledger.isError ? (
        <p role="alert" className="text-sm text-rose-700 dark:text-rose-400">
          Can’t reach the laptop API — the ledger is unavailable. (Not “all synced”.)
        </p>
      ) : ledger.isLoading ? (
        <p className="text-sm text-zinc-500">Loading ledger…</p>
      ) : (
        <>
          <LedgerTable rows={ledger.rows} />
          <p className="mt-3 text-xs text-zinc-400">
            Counts are the laptop’s view, from each row’s sync origin + stamp.{" "}
            {health.conn === "stale" && "Possibly stale — see the status bar."}
          </p>
        </>
      )}
    </section>
  );
}
