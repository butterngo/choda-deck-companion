// TASK-1608 — the other half of TASK-1595's layout contract.
//
// The shell owns width, but "full width" is only right for content that uses
// the space: boards, tables, lists. Prose does not. At 2560px the detail panes
// were rendering 2281px lines — roughly triple a comfortable measure — so the
// eye had to track horizontally across an entire monitor.
//
// Bounds to `72ch`, which at the app's 14px body lands near 800px and moves
// with the font rather than being pinned to a pixel guess.
//
// LEFT-ALIGNED, deliberately: no `mx-auto`. Centring makes the reading column
// jump position as you move between a bounded detail view and a full-width
// board, and that jump is more disruptive than the asymmetry it fixes.

export function Readable({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}): React.JSX.Element {
  return (
    <div data-testid="readable" className={`max-w-[72ch] ${className}`}>
      {children}
    </div>
  );
}
