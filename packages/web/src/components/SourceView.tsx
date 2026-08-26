// TASK-1789 / TASK-1792 — a source file, coloured when we can, readable when we
// cannot, and addressable by line.
//
// The text renders IMMEDIATELY as plain code; highlighting replaces it once the
// grammar arrives. That order is the point: a viewer that waited for a language
// chunk before showing anything would blank the pane on a slow load, and the
// pane's job is the text.
//
// TASK-1792 adds line numbers and a `#L<n>` anchor, because the audit chain
// ends at a line — "commit → task → ADR → this file, this line" — and a viewer
// that could only open a file at the top left that last step unanswerable.
//
// Highlighting is per-LINE rather than over the whole file, so a line can carry
// its own number and its own highlight state. highlight.js emits spans that may
// legitimately cross lines (a block comment, a template literal), so splitting
// its output by newline would tear the markup. Highlighting each line
// independently loses cross-line context in exchange for markup that is always
// well-formed — the right trade for a reader, and the reason a multi-line
// string may look plainer here than in an editor.

import { useEffect, useRef, useState } from "react";
import { highlight, languageFor } from "../lib/highlight";

/** `#L42` → 42. Anything else → null. */
export function lineFromHash(hash: string): number | null {
  const m = /^#L(\d+)$/.exec(hash);
  if (!m) return null;
  const n = Number.parseInt(m[1] ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function SourceView({
  path,
  code,
  /** 1-based line to mark and scroll to. Null marks nothing. */
  highlightLine = null,
}: {
  path: string;
  code: string;
  highlightLine?: number | null;
}): React.JSX.Element {
  const language = languageFor(path);
  const lines = code.replace(/\n$/, "").split("\n");
  const [html, setHtml] = useState<string[] | null>(null);
  const markedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setHtml(null);
    if (language === null) return;
    let cancelled = false;
    // `highlight` swallows its own failures and resolves null, but this call
    // site does not get to rely on that — without the catch, any future change
    // that lets it reject becomes an unhandled rejection in the app.
    void Promise.all(lines.map((l) => highlight(l, language)))
      .then((results) => {
        if (cancelled) return;
        setHtml(results.some((r) => r !== null) ? results.map((r, i) => r ?? lines[i]!) : null);
      })
      .catch(() => {
        if (!cancelled) setHtml(null);
      });
    return () => {
      cancelled = true;
    };
  }, [code, language]);

  useEffect(() => {
    // `block: "center"` rather than the default: landing a changed line flush
    // against the top edge hides the context above it, which is half of why
    // anyone wanted the line number.
    //
    // Feature-checked rather than called outright. jsdom has no
    // scrollIntoView, and a component that throws out of an effect because one
    // DOM method is absent takes the whole pane down — over a scroll position.
    // The mark still renders; only the convenience of being scrolled to is lost.
    const el = markedRef.current;
    if (typeof el?.scrollIntoView === "function") el.scrollIntoView({ block: "center" });
  }, [highlightLine, html]);

  return (
    <pre
      data-testid="doc-source"
      data-language={language ?? "none"}
      className="hljs overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800 py-2 text-xs leading-relaxed"
    >
      <code>
        {lines.map((line, i) => {
          const no = i + 1;
          const marked = highlightLine === no;
          return (
            <span
              key={no}
              id={`L${no}`}
              ref={marked ? markedRef : undefined}
              data-testid={`source-line-${no}`}
              data-marked={marked ? "true" : undefined}
              className={[
                "grid grid-cols-[3.5rem_1fr] gap-3",
                marked ? "bg-amber-100 dark:bg-amber-950/40" : "",
              ].join(" ")}
            >
              <span
                aria-hidden="true"
                className="select-none pr-2 text-right tabular-nums text-zinc-400"
              >
                {no}
              </span>
              {html === null ? (
                <span>{line}</span>
              ) : (
                /* highlight.js escapes its input, so the string here is markup
                   it built, not markup from the file: a `<script>` in the
                   source arrives as &lt;script&gt;. */
                <span
                  data-testid={`source-line-html-${no}`}
                  dangerouslySetInnerHTML={{ __html: html[i] ?? "" }}
                />
              )}
            </span>
          );
        })}
      </code>
    </pre>
  );
}
