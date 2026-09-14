// TASK-1956 — render a workspace .html file so a report can be READ, not spelled
// out as source.
//
// The whole design is the sandbox attribute, so read that first.
//
// A workspace .html is arbitrary content — whatever happens to be on disk in a
// folder Butter pointed at. Putting it into this document with
// dangerouslySetInnerHTML would let its <script> run in the renderer that holds
// the bridge token and talks to the adapter. That is not a hypothetical risk to
// weigh; it is the reason this component exists in the shape it does.
//
// `sandbox=""` — present, and EMPTY — gives the frame:
//   · an opaque origin: it cannot reach this document, its storage, or the
//     adapter, even though the bytes came from there
//   · no scripting at all: no allow-scripts, so nothing in the file executes
//   · no form submission, no top-level navigation, no popups
//
// The cost, stated rather than discovered later: an HTML file that NEEDS
// JavaScript renders without it. For reading documents and reports — which is
// what this pane is for — that is correct. Serving scriptable HTML would mean
// adding allow-scripts, and that is a separate decision with a separate threat
// model; it must not arrive by someone loosening this attribute to fix a page.
//
// srcdoc rather than a src URL, deliberately: the pane already HAS the bytes
// (the docs hook fetched them with the bridge token). A src would mean a second
// request the frame cannot authenticate — the adapter route is header-gated, and
// a sandboxed frame has no way to send that header.

import React from "react";

export function HtmlDocView({
  html,
  path,
}: {
  html: string;
  path: string;
}): React.JSX.Element {
  return (
    <div className="not-prose flex flex-col gap-2">
      <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
        <i className="ti ti-file-type-html flex-none text-zinc-400" aria-hidden="true" />
        <span>Rendered without scripts</span>
        <span className="text-zinc-400 dark:text-zinc-600">·</span>
        {/* Said on screen, not only in a comment. A reader who wonders why an
            interactive page looks inert deserves the answer in front of them. */}
        <span>sandboxed, isolated from the app</span>
      </div>

      <iframe
        // Empty on purpose. See the note above: any allow-* token here would
        // undo the isolation this whole component is for.
        sandbox=""
        srcDoc={html}
        title={`Rendered document: ${path}`}
        data-testid="html-doc-frame"
        className="min-h-[70vh] w-full rounded-md border border-zinc-200 bg-white dark:border-zinc-800"
      />
    </div>
  );
}
