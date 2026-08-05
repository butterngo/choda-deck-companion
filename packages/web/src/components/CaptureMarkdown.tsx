// TASK-1569 — the one markdown renderer that knows about capture artifacts.
//
// A capture body embeds `![capture](captures/ab12.png)`. Rendered by plain
// react-markdown that becomes an <img> pointing at a path the browser cannot
// resolve; rendered by a <pre> (as task bodies were) it stays literal text. This
// component rewrites those refs to `/api/artifacts/...` and picks the right
// element: images inline, everything else (.har, .json, .jsonl, .md) a download
// link, because a HAR file in an <img> is just a broken icon.

import Markdown from "react-markdown";
import {
  isImageRef,
  normalizeCaptureBody,
  resolveCaptureRef,
  toArtifactsRelative,
} from "../lib/capture-refs";

function fileNameOf(ref: string): string {
  const rel = toArtifactsRelative(ref) ?? ref;
  return rel.split("/").pop() || rel;
}

export function CaptureMarkdown({ children }: { children: string }): React.JSX.Element {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      <Markdown
        components={{
          img: ({ src, alt }) => {
            const ref = typeof src === "string" ? src : "";
            const resolved = resolveCaptureRef(ref);
            // A non-image artifact written as an image ref (a HAR bundle linked
            // with `![]()`) would render as a broken icon — send it to the link
            // branch instead.
            if (!isImageRef(ref) && resolved !== ref) {
              return (
                <a href={resolved} download={fileNameOf(ref)}>
                  {alt || fileNameOf(ref)}
                </a>
              );
            }
            return (
              <img
                src={resolved}
                alt={alt || "capture"}
                loading="lazy"
                className="max-w-full rounded border border-zinc-200 dark:border-zinc-800"
              />
            );
          },
          a: ({ href, children: linkChildren }) => {
            const ref = typeof href === "string" ? href : "";
            const resolved = resolveCaptureRef(ref);
            if (resolved === ref) {
              return (
                <a href={ref} target="_blank" rel="noreferrer">
                  {linkChildren}
                </a>
              );
            }
            return (
              <a href={resolved} download={fileNameOf(ref)}>
                {linkChildren}
              </a>
            );
          },
        }}
      >
        {/* Pre-parse normalization — a legacy backslash path in a link
            destination is eaten by CommonMark escaping before any component
            override could see it. */}
        {normalizeCaptureBody(children)}
      </Markdown>
    </div>
  );
}
