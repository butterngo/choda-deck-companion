import DOMPurify from "dompurify";
import { marked } from "marked";
import { useMemo } from "react";

/**
 * marked.parse → DOMPurify.sanitize → dangerouslySetInnerHTML.
 * DOMPurify kept per TASK-806: companion ingests untrusted task bodies
 * and run reports from disk; marked alone does not sanitize.
 */
export function Markdown({ source }: { source: string }) {
  const html = useMemo(() => {
    if (!source) return "";
    const raw = marked.parse(source, { async: false }) as string;
    return DOMPurify.sanitize(raw);
  }, [source]);

  return (
    <div
      className="prose prose-zinc dark:prose-invert max-w-none"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
