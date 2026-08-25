// TASK-1781 — a ```mermaid fence rendered as a diagram.
//
// mermaid is imported DYNAMICALLY, and only when a block actually exists. The
// package unpacks to 84 MB and the companion installer is already 196 MB, so
// this is a requirement rather than an optimisation. `import()` here means the
// bundler emits a separate chunk that a reader who never opens a diagram never
// downloads.
//
// A fence that will not parse renders as a named failure with the source still
// visible, not as a blank space. A diagram that silently vanishes is
// indistinguishable from a document that never had one, which is the wrong
// direction to be wrong in for a docs browser.

import { useEffect, useRef, useState } from "react";

/** Bumped per render so two diagrams on one page cannot share an element id. */
let seq = 0;

export function MermaidBlock({ code }: { code: string }): React.JSX.Element {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const idRef = useRef(`mermaid-${(seq += 1)}`);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          // The docs pane follows the OS theme; `neutral` reads acceptably in
          // both, and mermaid cannot re-theme an already-rendered SVG anyway.
          theme: "neutral",
          securityLevel: "strict",
        });
        const { svg: rendered } = await mermaid.render(idRef.current, code);
        if (!cancelled) setSvg(rendered);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (error !== null) {
    return (
      <div
        data-testid="mermaid-error"
        className="not-prose rounded-md border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-2.5"
      >
        <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
          This diagram could not be drawn.
        </p>
        <p className="mt-0.5 text-[11px] text-amber-700 dark:text-amber-400">{error}</p>
        {/* The source stays readable — a broken diagram should not also lose
            the text that describes it. */}
        <pre className="mt-1.5 overflow-x-auto text-[11px] text-zinc-600 dark:text-zinc-400">
          {code}
        </pre>
      </div>
    );
  }

  if (svg === null) {
    return (
      <div data-testid="mermaid-pending" className="not-prose text-xs text-zinc-400">
        Drawing diagram…
      </div>
    );
  }

  return (
    <div
      data-testid="mermaid-diagram"
      className="not-prose overflow-x-auto"
      // mermaid renders with securityLevel 'strict', which strips scripts and
      // event handlers from the output. The input is a local .md file the user
      // already owns, not remote content.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
