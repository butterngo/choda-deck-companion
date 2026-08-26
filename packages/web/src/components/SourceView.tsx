// TASK-1789 — a source file, coloured when we can and readable when we cannot.
//
// The text renders IMMEDIATELY as plain code; highlighting replaces it once the
// grammar arrives. That order is the point: a viewer that waited for a language
// chunk before showing anything would blank the pane on a slow load, and the
// pane's job is the text.

import { useEffect, useState } from "react";
import { highlight, languageFor } from "../lib/highlight";

export function SourceView({ path, code }: { path: string; code: string }): React.JSX.Element {
  const language = languageFor(path);
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    setHtml(null);
    if (language === null) return;
    let cancelled = false;
    // `highlight` swallows its own failures and resolves null, but this call
    // site does not get to rely on that. Without the catch, any future change
    // that lets it reject becomes an unhandled promise rejection in the app —
    // and vitest flagged exactly that ("this might cause false positive
    // tests") the first time a test forced a rejection through.
    void highlight(code, language)
      .then((result) => {
        if (!cancelled) setHtml(result);
      })
      .catch(() => {
        if (!cancelled) setHtml(null);
      });
    return () => {
      cancelled = true;
    };
  }, [code, language]);

  return (
    <pre
      data-testid="doc-source"
      data-language={language ?? "none"}
      className="hljs overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800 p-3 text-xs leading-relaxed"
    >
      {html === null ? (
        <code>{code}</code>
      ) : (
        /* highlight.js escapes its input; the string it returns is markup it
           built, not markup from the file. The file's own `<script>` arrives
           here as &lt;script&gt;. */
        <code data-testid="doc-source-highlighted" dangerouslySetInnerHTML={{ __html: html }} />
      )}
    </pre>
  );
}
