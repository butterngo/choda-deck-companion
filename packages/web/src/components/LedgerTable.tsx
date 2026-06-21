// TASK-1160 AC-1/AC-4 — the per-entity sync ledger. One row per entity type, four
// buckets sourced from /sync/ledger. Presentational: tests drive it with mocked
// rows. Tombstones read as "removed via sync" (AC-4), not a vanished count.

import type { LedgerRow } from "../api";

// Display order + labels for the buckets. remote-only is attributed to Claude
// Design (the other writer) per the spec.
const BUCKETS: ReadonlyArray<{
  key: keyof Omit<LedgerRow, "entity">;
  label: string;
  icon: string;
  tone: string;
  title: string;
}> = [
  { key: "inSync", label: "in sync", icon: "ti-check", tone: "text-emerald-600 dark:text-emerald-400", title: "stamped + converged with the remote" },
  { key: "localOnly", label: "local only", icon: "ti-arrow-up", tone: "text-sky-600 dark:text-sky-400", title: "exists here, not yet pushed" },
  { key: "remoteOnly", label: "from Claude Design", icon: "ti-arrow-down", tone: "text-violet-600 dark:text-violet-400", title: "authored remotely, pulled to the laptop" },
  { key: "tombstoned", label: "removed via sync", icon: "ti-trash", tone: "text-zinc-500 dark:text-zinc-400", title: "deleted through sync — not lost, removed on purpose" },
];

const ENTITY_LABEL: Record<string, string> = {
  tasks: "Tasks",
  inbox: "Inbox",
  conversations: "Conversations",
  projects: "Projects",
};

export function LedgerTable({ rows }: { rows: LedgerRow[] }): React.JSX.Element {
  return (
    <table className="w-full text-sm border-collapse" aria-label="sync ledger">
      <thead>
        <tr className="text-left text-zinc-500">
          <th className="py-2 pr-4 font-medium">Entity</th>
          {BUCKETS.map((b) => (
            <th key={b.key} className="py-2 px-3 font-medium" title={b.title}>
              <span className="flex items-center gap-1">
                <i className={`ti ${b.icon} ${b.tone}`} aria-hidden="true" />
                {b.label}
              </span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.entity} data-entity={row.entity} className="border-t border-zinc-200 dark:border-zinc-800">
            <td className="py-2 pr-4 font-medium">{ENTITY_LABEL[row.entity] ?? row.entity}</td>
            {BUCKETS.map((b) => {
              const n = row[b.key];
              return (
                <td key={b.key} data-bucket={b.key} className="py-2 px-3 mono tabular-nums">
                  <span className={n > 0 ? b.tone : "text-zinc-300 dark:text-zinc-600"}>{n}</span>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
