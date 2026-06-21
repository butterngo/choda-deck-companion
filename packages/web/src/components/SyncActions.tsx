// TASK-1160 AC-3 — explicit Pull / Push. Both confirm before running (these move
// data between laptop and remote) and surface the result or error — never a
// silent success. On completion the ledger refetches so the buckets update.

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { pullSync, pushSync, type SyncActionResult } from "../api";

function summarize(kind: "pull" | "push", r: SyncActionResult): string {
  if (r.message) return r.message;
  if (kind === "pull") return `Pulled — ${r.upserted ?? 0} upserted, ${r.tombstoned ?? 0} removed.`;
  return `Pushed — ${r.pushed ?? 0} sent.`;
}

export function SyncActions({ onDone }: { onDone: () => void }): React.JSX.Element {
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onError = (kind: string) => (e: unknown) =>
    setError(`${kind} failed: ${e instanceof Error ? e.message : String(e)}`);

  const pull = useMutation({
    mutationFn: pullSync,
    onSuccess: (r) => {
      setResult(summarize("pull", r));
      onDone();
    },
    onError: onError("pull"),
  });
  const push = useMutation({
    mutationFn: pushSync,
    onSuccess: (r) => {
      setResult(summarize("push", r));
      onDone();
    },
    onError: onError("push"),
  });

  const busy = pull.isPending || push.isPending;

  const click = (kind: "pull" | "push", mutate: () => void) => () => {
    // confirm gate — these are not idempotent reads
    if (!window.confirm(`Run ${kind}? This syncs data between the laptop and the remote.`)) return;
    setResult(null);
    setError(null);
    mutate();
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={click("pull", () => pull.mutate())}
        disabled={busy}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-50"
      >
        <i className={`ti ti-arrow-down ${pull.isPending ? "spin" : ""}`} aria-hidden="true" />
        Pull
      </button>
      <button
        type="button"
        onClick={click("push", () => push.mutate())}
        disabled={busy}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-50"
      >
        <i className={`ti ti-arrow-up ${push.isPending ? "spin" : ""}`} aria-hidden="true" />
        Push
      </button>
      {result && <span role="status" className="text-sm text-emerald-700 dark:text-emerald-400">{result}</span>}
      {error && <span role="alert" className="text-sm text-rose-700 dark:text-rose-400">{error}</span>}
    </div>
  );
}
