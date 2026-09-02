// TASK-1799 — the answers that are not one jump.
//
// A symbol click has four possible outcomes and only one of them navigates.
// The other three used to be silence, which is the failure this component
// exists to end: a pane that did nothing looked identical whether the name had
// no declaration, the workspace was wrong, or the route was never deployed.
//
// Each state gets its own testid, and every test asserts the OTHERS are absent.
// That pairing is deliberate — a component that rendered all four at once, or
// collapsed them into one message, would satisfy any single assertion.
//
// Nothing here is an ErrorState except the genuine failure. "No declaration
// found" and "your app is behind" are ordinary facts about a working system,
// and painting them rose would train the eye to ignore the real errors —
// CapabilityNote's own header makes that argument and this follows it.

import { CapabilityNote } from "./state/CapabilityNote";
import { ErrorState } from "./state/ErrorState";
import type { SymbolMatch } from "../api";

export function SymbolLookupPanel({
  name,
  matches,
  isResolved,
  isError,
  routeMissing,
  unknownWorkspace,
  workspaceLabel,
  onPick,
  onDismiss,
}: {
  name: string | null;
  matches: SymbolMatch[];
  isResolved: boolean;
  isError: boolean;
  routeMissing: boolean;
  unknownWorkspace: boolean;
  /** Named in the zero-match copy, because scope is this workspace only. */
  workspaceLabel: string | null;
  onPick: (match: SymbolMatch) => void;
  onDismiss: () => void;
}): React.JSX.Element | null {
  if (name === null) return null;

  // Order matters: the diagnosed 404s are checked BEFORE the empty-match case,
  // because both arrive with an empty `matches` array and the reader must not
  // be told a name has no declaration when nothing was ever searched.
  if (routeMissing) {
    return (
      <CapabilityNote icon="ti-refresh-alert">
        <span data-testid="symbol-adapter-outdated">
          <span className="font-medium text-zinc-900 dark:text-zinc-100">
            This app is behind its adapter.
          </span>{" "}
          Symbol lookup shipped after the adapter bundle this app carries, so
          nothing was searched for <span className="font-mono">{name}</span>.
          Update the companion and try again.
        </span>
      </CapabilityNote>
    );
  }

  if (unknownWorkspace) {
    return (
      <ErrorState
        variant="failed"
        subject={`symbols for ${workspaceLabel ?? "this workspace"}`}
        description="The adapter does not know this workspace, so no file was searched."
      />
    );
  }

  if (isError) {
    return <ErrorState variant="failed" subject={`the lookup for ${name}`} />;
  }

  if (!isResolved) return null;

  if (matches.length === 0) {
    return (
      <CapabilityNote icon="ti-search-off">
        <span data-testid="symbol-not-found">
          No declaration of <span className="font-mono">{name}</span> in{" "}
          <span className="font-medium text-zinc-900 dark:text-zinc-100">
            {workspaceLabel ?? "this workspace"}
          </span>
          . Only this workspace was searched — it may be a local, a keyword, or
          declared in another repository.
        </span>
      </CapabilityNote>
    );
  }

  // A single match never reaches here: the view navigates on it (TASK-1798
  // AC-5). Rendering a one-row picker would make the common case cost a second
  // click for no information.
  return (
    <div
      data-testid="symbol-picker"
      className="mb-3 overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800"
    >
      <div className="flex items-center gap-1.5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-2.5 py-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
          {matches.length} declarations of
        </span>
        <span className="font-mono text-xs text-zinc-600 dark:text-zinc-300">{name}</span>
        <button
          type="button"
          onClick={onDismiss}
          data-testid="symbol-picker-dismiss"
          className="ml-auto text-[11px] text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
        >
          Dismiss
        </button>
      </div>
      {/* Buttons here, unlike the identifiers themselves: this is a bounded set
          a reader is choosing from, so every row must be reachable by keyboard.
          The per-identifier case was refused for the opposite reason — it was
          unbounded (TASK-1798 AC-7). */}
      <ul className="max-h-56 overflow-y-auto">
        {matches.map((m) => (
          <li key={`${m.path}:${m.line}`}>
            <button
              type="button"
              onClick={() => onPick(m)}
              data-testid={`symbol-match-${m.path}:${m.line}`}
              className="flex w-full items-baseline gap-2.5 px-2.5 py-2 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <span className="w-14 flex-none font-mono text-[11px] text-zinc-400">{m.kind}</span>
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-zinc-700 dark:text-zinc-200">
                {m.path}
              </span>
              <span className="flex-none tabular-nums text-[11px] text-zinc-400">:{m.line}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
