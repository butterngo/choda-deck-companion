// TASK-1594 — the two failures the companion must never conflate (ADR-028,
// honest liveness):
//
//   unreachable — the laptop API did not answer. The data is UNAVAILABLE, not
//                 empty. Nothing else on the screen can be trusted either.
//   failed      — the API answered and this one thing failed. Everything else
//                 still works, so the message names the subject and scopes the
//                 damage.
//
// `variant` is required and has no default on purpose. A default would let a
// caller silently render "can't reach the laptop" for a single 500, which is
// the exact dishonesty ADR-028 exists to prevent.

import type { ReactNode } from "react";

export type ErrorVariant = "unreachable" | "failed";

export function ErrorState({
  variant,
  subject,
  description,
  action,
}: {
  variant: ErrorVariant;
  /** What failed to load. Used by `failed`; ignored by `unreachable`. */
  subject?: string;
  description?: string;
  action?: ReactNode;
}): React.JSX.Element {
  const unreachable = variant === "unreachable";

  const title = unreachable
    ? "Can’t reach the laptop API"
    : `Couldn’t load ${subject ?? "this"}`;

  const fallbackDescription = unreachable
    ? "The data is unavailable — this is not an empty result."
    : "The API answered, but this request failed. Other data is still current.";

  return (
    <div
      role="alert"
      data-testid="error-state"
      data-variant={variant}
      className="flex flex-col items-center text-center gap-1 px-5 py-9 text-rose-700 dark:text-rose-400"
    >
      <span className="mb-1.5 grid place-items-center w-8 h-8 rounded-md bg-rose-50 dark:bg-rose-950/40">
        <i
          className={`ti ${unreachable ? "ti-plug-connected-x" : "ti-alert-triangle"}`}
          aria-hidden="true"
        />
      </span>
      <span className="font-medium">{title}</span>
      <span className="text-sm max-w-[44ch] leading-relaxed">
        {description ?? fallbackDescription}
      </span>
      {action && <span className="mt-2">{action}</span>}
    </div>
  );
}
