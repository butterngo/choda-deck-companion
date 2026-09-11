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

export function MermaidBlock({
  code,
  edit,
}: {
  code: string;
  /** Absent — the normal case — renders a picture with no controls on it. The
      docs pane passes this once it can say WHICH fence the picture is. */
  edit?: { label: string; onEdit: () => void };
}): React.JSX.Element {
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

  /** The Edit affordance, on the picture itself. Always visible rather than
      revealed on hover: a control nobody can find is the defect this exists to
      fix, and hover hides it from touch and from a reader who never sweeps the
      mouse across the diagram. */
  function bar(): React.JSX.Element | null {
    if (edit === undefined) return null;
    return (
      <div className="not-prose mb-1 flex items-center gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
          {edit.label}
        </span>
        <button
          type="button"
          data-testid="diagram-edit"
          onClick={edit.onEdit}
          className="ml-auto flex flex-none items-center gap-1.5 rounded-md border border-zinc-200 dark:border-zinc-800 px-1.5 py-1 text-[11px] text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
        >
          <i className="ti ti-pencil" aria-hidden="true" />
          Edit
        </button>
      </div>
    );
  }

  if (error !== null) {
    return (
      <div className="not-prose">
        {/* Offered on a BROKEN diagram too — that is the one a reader most
            wants to fix, and withholding it here would send them to the list at
            the foot of the document for the commonest reason to edit at all. */}
        {bar()}
        <div
          data-testid="mermaid-error"
          className="rounded-md border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-2.5"
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
      </div>
    );
  }

  if (svg === null) {
    return (
      <div className="not-prose">
        {/* Offered while it is still drawing, too. mermaid is an 84 MB chunk
            fetched on first use, so this state can last — and a control that
            appears only once the picture resolves is missing exactly when the
            reader is waiting on a diagram that may never come. */}
        {bar()}
        <div data-testid="mermaid-pending" className="text-xs text-zinc-400">
          Drawing diagram…
        </div>
      </div>
    );
  }

  return (
    <div className="not-prose">
      {bar()}
      <div
        data-testid="mermaid-diagram"
        className="overflow-x-auto"
        // mermaid renders with securityLevel 'strict', which strips scripts and
        // event handlers from the output. The input is a local .md file the user
        // already owns, not remote content.
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  );
}
