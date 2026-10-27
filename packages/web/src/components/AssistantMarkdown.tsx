// TASK-2760 — how an assistant reply renders: GitHub-flavoured markdown (tables,
// lists, links) with fenced code shown as a block that has its language and a
// Copy button. Copy writes exactly the code inside the fence, never the fence
// markers, so a pasted snippet runs as is.
//
// Highlighting is the file viewer's (lib/highlight.ts): one lazy grammar per
// language, applied after first paint. Until it lands, and for a language it
// does not know, the block shows the plain code — never an empty box.
//
// Only assistant replies come through here; a user's own message stays plain
// text, so `**bold**` they typed is shown as they typed it.
//
// TASK-2774 — with `diagrams`, a ```mermaid fence is drawn by MermaidBlock (the
// task page's renderer: lazy import, securityLevel strict) on a white panel,
// because its neutral theme draws dark lines that vanish on the dark-mode
// background. The view passes `diagrams` only for finished replies: a fence
// still streaming does not parse yet and would flash an error on every delta.

import { useEffect, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { highlight, languageFor } from "../lib/highlight";
import { MermaidBlock } from "./MermaidBlock";

const COPIED_MS = 2000;

/** A code block's header: the language and a Copy that writes exactly `code`. */
function BlockHeader({ code, lang }: { code: string; lang: string | null }): React.JSX.Element {
  const [copied, setCopied] = useState(false);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), COPIED_MS);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50 px-2.5 py-1 dark:border-zinc-800 dark:bg-zinc-900">
      <span className="text-xs text-zinc-500">{lang ?? "code"}</span>
      <button
        type="button"
        onClick={() => void copy()}
        className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
          copied ? "text-green-700 dark:text-green-400" : "text-zinc-600 dark:text-zinc-300"
        }`}
      >
        <i className={`ti ${copied ? "ti-check" : "ti-copy"}`} aria-hidden="true" />
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function DiagramBlock({ code }: { code: string }): React.JSX.Element {
  return (
    <div className="not-prose my-2 overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800">
      <BlockHeader code={code} lang="mermaid" />
      <div data-testid="assistant-diagram" className="bg-white p-2 text-zinc-900">
        <MermaidBlock code={code} />
      </div>
    </div>
  );
}

function CodeBlock({ code, lang }: { code: string; lang: string | null }): React.JSX.Element {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const language = lang ? languageFor(`x.${lang}`) ?? lang : null;
    if (language) {
      void highlight(code, language)
        .then((h) => {
          if (alive) setHtml(h);
        })
        .catch(() => undefined);
    }
    return () => {
      alive = false;
    };
  }, [code, lang]);

  return (
    <div className="not-prose my-2 overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800">
      <BlockHeader code={code} lang={lang} />
      <pre className="m-0 overflow-x-auto bg-white px-3 py-2 text-[13px] leading-relaxed dark:bg-zinc-950">
        {html !== null ? (
          <code className={`hljs language-${lang ?? ""}`} dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <code>{code}</code>
        )}
      </pre>
    </div>
  );
}

export function AssistantMarkdown({
  children,
  diagrams = false,
}: {
  children: string;
  /** Draw ```mermaid fences as diagrams. Finished replies only (see the header). */
  diagrams?: boolean;
}): React.JSX.Element {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          // A fenced block reaches `pre` with its `code` child; the block is
          // drawn here so inline `code` keeps the default rendering below.
          pre: ({ children: pre }) => {
            const child = Array.isArray(pre) ? pre[0] : pre;
            const props = (child as { props?: { className?: string; children?: unknown } } | null)?.props ?? {};
            const lang = /language-([\w+-]+)/.exec(props.className ?? "")?.[1] ?? null;
            const code = String(props.children ?? "").replace(/\n$/, "");
            if (diagrams && lang === "mermaid") return <DiagramBlock code={code} />;
            return <CodeBlock code={code} lang={lang} />;
          },
          a: ({ href, children: link }) => (
            <a href={href} target="_blank" rel="noreferrer">
              {link}
            </a>
          ),
        }}
      >
        {children}
      </Markdown>
    </div>
  );
}
