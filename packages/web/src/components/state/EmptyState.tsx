// TASK-1594 — "there is genuinely nothing here", as distinct from "we could not
// find out". Empty is a valid, calm state; it gets an icon, a title naming what
// is empty, and where useful a way out. It never uses error colour.
//
// `action` is optional and, when absent, renders nothing at all — an empty
// wrapper element would leave a stray focus stop and a gap in the layout.

import type { ReactNode } from "react";

export function EmptyState({
  icon = "ti-inbox",
  title,
  description,
  action,
}: {
  icon?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}): React.JSX.Element {
  return (
    <div
      data-testid="empty-state"
      className="flex flex-col items-center text-center gap-1 px-5 py-9 text-zinc-600 dark:text-zinc-300"
    >
      <span className="mb-1.5 grid place-items-center w-8 h-8 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-400">
        <i className={`ti ${icon}`} aria-hidden="true" />
      </span>
      <span className="font-medium text-zinc-900 dark:text-zinc-100">{title}</span>
      {description && (
        <span className="text-sm max-w-[44ch] leading-relaxed">{description}</span>
      )}
      {action && <span className="mt-2">{action}</span>}
    </div>
  );
}
