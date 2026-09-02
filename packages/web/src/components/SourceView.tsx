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
import { escapeHtml, symbolFromEvent, wrapIdentifiers } from "../lib/symbols";

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
  /**
   * TASK-1794 — the 1-based lines to mark. Empty marks nothing.
   *
   * A SET, not a number. The single-line version was not a smaller version of
   * this: a commit that changed 13 lines lit up 1, and the other 12 looked
   * untouched. Keeping both props would have left two ways to say the same
   * thing, and the one nobody passes drifts first.
   */
  highlightLines,
  /**
   * TASK-1798 — called with the identifier a reader clicked.
   *
   * Its PRESENCE is what turns identifiers into click targets: a pane that does
   * not know how to resolve a symbol has no business offering one. So the two
   * call sites that only display code stay exactly as they were.
   */
  onSymbolClick,
}: {
  path: string;
  code: string;
  highlightLines?: ReadonlySet<number>;
  onSymbolClick?: (name: string) => void;
}): React.JSX.Element {
  const language = languageFor(path);
  const lines = code.replace(/\n$/, "").split("\n");
  // The line to scroll to: the lowest marked one, or null when nothing is
  // marked. Computed rather than taken as a second prop, so it cannot disagree
  // with the set it is supposed to describe.
  const firstMarked =
    highlightLines === undefined || highlightLines.size === 0
      ? null
      : Math.min(...highlightLines);
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
  }, [firstMarked, html]);

  // TASK-1798 — symbols are offered only when the language is recognised.
  // Wrapping a file we cannot identify would hand the reader click targets for
  // words in prose, and every one of them would resolve to nothing.
  const symbolsEnabled = onSymbolClick !== undefined && language !== null;

  return (
    <>
      {onSymbolClick !== undefined && language === null && (
        /* A rendered absence, not silence. "No language recognised" and "this
           file has no symbols" look identical on screen, and only one of them
           is a fact about the code — the same trap CommitDetailPanel names. */
        <p data-testid="symbols-unavailable" className="mb-2 text-xs text-zinc-500">
          Language not recognised for this file — symbols are not clickable here.
        </p>
      )}
      <pre
      data-testid="doc-source"
      data-language={language ?? "none"}
      data-symbols={symbolsEnabled ? "on" : "off"}
      className="hljs overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800 py-2 text-xs leading-relaxed"
      onClick={
        symbolsEnabled
          ? (e) => {
              // One handler for the whole file rather than one per identifier:
              // a 500-line file carries thousands of them, and the listeners
              // would cost more than the feature.
              const name = symbolFromEvent(e.target);
              if (name !== null) onSymbolClick(name);
            }
          : undefined
      }
    >
      <code>
        {lines.map((line, i) => {
          const no = i + 1;
          const marked = highlightLines?.has(no) ?? false;
          // Only the FIRST marked line gets the ref. Scrolling to the last one
          // would land the reader at the bottom of the change with its opening
          // above the fold.
          const isFirstMarked = marked && no === firstMarked;
          return (
            <span
              key={no}
              id={`L${no}`}
              ref={isFirstMarked ? markedRef : undefined}
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
              {html === null && !symbolsEnabled ? (
                <span>{line}</span>
              ) : (
                /* highlight.js escapes its input, so the string here is markup
                   it built, not markup from the file: a `<script>` in the
                   source arrives as &lt;script&gt;.

                   TASK-1798 — the plain-text path is escaped here for the same
                   reason, then goes through the identical wrapper. Without
                   that, whether an identifier was clickable would depend on
                   how fast a language chunk loaded. */
                <span
                  data-testid={`source-line-html-${no}`}
                  dangerouslySetInnerHTML={{
                    __html: (() => {
                      const markup = html === null ? escapeHtml(line) : (html[i] ?? "");
                      return symbolsEnabled ? wrapIdentifiers(markup) : markup;
                    })(),
                  }}
                />
              )}
            </span>
          );
        })}
      </code>
      </pre>
    </>
  );
}
