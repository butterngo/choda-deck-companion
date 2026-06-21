// TASK-1159 — Sync pillar placeholder. The real Sync Observatory (per-entity
// ledger + Pull/Push) lands in TASK-1160 on top of this shell.

export function SyncView(): React.JSX.Element {
  return (
    <section aria-label="sync observatory">
      <h1 className="text-lg font-medium mb-1">Sync Observatory</h1>
      <p className="text-sm text-zinc-500">
        Per-entity sync ledger (in-sync / local-only / remote-only / tombstoned) and Pull/Push
        land here — TASK-1160.
      </p>
    </section>
  );
}
