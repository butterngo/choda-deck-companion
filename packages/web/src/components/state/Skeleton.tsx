// TASK-1594 — loading placeholder shaped like the content it replaces, so the
// layout does not jump when data lands. The previous treatment was a bare
// `<p className="text-sm text-zinc-500">Loading…</p>`, which is both invisible
// as design and a layout shift waiting to happen.
//
// Accessibility split: the bars are decorative and hidden from the a11y tree,
// while the wrapper announces the load. A screen reader should hear "Loading…"
// once, not read six empty divs.

export type SkeletonShape = "list" | "card" | "text";

const BAR = "rounded bg-zinc-100 dark:bg-zinc-800 animate-pulse";

function Bars({ shape }: { shape: SkeletonShape }): React.JSX.Element {
  if (shape === "text") {
    return (
      <div className="flex flex-col gap-2">
        <div className={`${BAR} h-3 w-full`} />
        <div className={`${BAR} h-3 w-11/12`} />
        <div className={`${BAR} h-3 w-8/12`} />
      </div>
    );
  }
  if (shape === "card") {
    return (
      <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3 flex flex-col gap-2">
        <div className={`${BAR} h-3 w-1/3`} />
        <div className={`${BAR} h-3 w-full`} />
        <div className={`${BAR} h-3 w-2/3`} />
      </div>
    );
  }
  // "list" — repeats the card shape, matching the bounded list panes.
  return (
    <div className="flex flex-col gap-2">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="rounded-md border border-zinc-200 dark:border-zinc-800 px-2.5 py-2 flex flex-col gap-1.5"
        >
          <div className={`${BAR} h-3 w-2/5`} />
          <div className={`${BAR} h-3 w-4/5`} />
        </div>
      ))}
    </div>
  );
}

export function Skeleton({
  shape = "list",
  label = "Loading…",
}: {
  shape?: SkeletonShape;
  label?: string;
}): React.JSX.Element {
  return (
    <div role="status" aria-busy="true" data-testid="skeleton">
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" data-testid="skeleton-bars">
        <Bars shape={shape} />
      </div>
    </div>
  );
}
