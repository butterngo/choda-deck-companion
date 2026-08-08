// TASK-1594 — a server-side capability is switched off or unavailable, e.g.
// `/knowledge/search` returning `{enabled: false, reason}` when the embedding
// deps are missing.
//
// Neutral by design, never error colour. Nothing is broken and nothing failed:
// one feature is absent while everything around it still works. Painting that
// rose would train the eye to ignore real errors, so this component carries no
// `rose-` class at all — a fact its test asserts rather than trusts.
//
// It is a note ABOVE working content, not a replacement for it. Callers keep
// rendering the list underneath.

export function CapabilityNote({
  children,
  icon = "ti-info-circle",
}: {
  children: React.ReactNode;
  icon?: string;
}): React.JSX.Element {
  return (
    <div
      data-testid="capability-note"
      className="flex items-start gap-2 rounded-md bg-zinc-100 dark:bg-zinc-800 px-2.5 py-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300"
    >
      <i className={`ti ${icon} mt-px text-zinc-400`} aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}
