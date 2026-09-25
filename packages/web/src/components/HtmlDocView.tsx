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

//
// TASK-2142 — srcdoc has no base URL either, so a report's relative <img src>
// resolves to nothing. With a workspaceId, the images are fetched here (where
// the token can be sent) and inlined as data: URIs before the frame sees the
// document. The frame shows the file as-is first and swaps in the inlined copy
// when it is ready; a failed image leaves its src untouched. None of this
// touches the sandbox attribute.
//
// TASK-2143 — and because srcdoc inherits the PARENT's base URL, an in-page
// `#anchor` link would navigate the frame to the app itself. withSrcdocBase
// pins the base to about:srcdoc so those links stay inside the document.

import React, { useEffect, useState } from "react";
import { fetchWorkspaceImageDataUri } from "../api";
import { inlineReportImages } from "../lib/report-images";
import { withSrcdocBase } from "../lib/srcdoc-base";

/**
 * TASK-2145 — the packaged app's bridge (preload.cjs). Absent in the browser
 * shell, which has no IPC: the button is then not rendered rather than dead.
 */
type OpenHtml = (workspaceId: string, path: string) => Promise<{ ok: boolean; reason?: string }>;

function openHtmlBridge(): OpenHtml | null {
  const w = window as unknown as { choda?: { openHtml?: unknown } };
  return typeof w.choda?.openHtml === "function" ? (w.choda.openHtml as OpenHtml) : null;
}

/**
 * Open the report as itself, in the default browser, where its own scripts run
 * and its relative paths resolve — neither of which the sandboxed frame allows.
 * The main process decides whether it may; a refusal is shown, not swallowed.
 */
function OpenInBrowser({ workspaceId, path }: { workspaceId: string; path: string }): React.JSX.Element | null {
  const [error, setError] = useState<string | null>(null);
  const open = openHtmlBridge();
  if (!open) return null;
  return (
    <>
      <button
        type="button"
        data-testid="html-doc-open-browser"
        title="Open this file in the default browser, with its scripts"
        onClick={() => {
          setError(null);
          void open(workspaceId, path)
            .then((r) => setError(r.ok ? null : (r.reason ?? "could not open")))
            .catch(() => setError("could not open"));
        }}
        className="ml-auto flex flex-none items-center gap-1.5 rounded-md border border-zinc-200 dark:border-zinc-800 px-1.5 py-1 text-[11px] text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
      >
        <i className="ti ti-external-link" aria-hidden="true" />
        Open in browser
      </button>
      {error && (
        <span className="text-[11px] text-amber-700 dark:text-amber-400" data-testid="html-doc-open-browser-error">
          {error}
        </span>
      )}
    </>
  );
}

export function HtmlDocView({
  html,
  path,
  workspaceId,
}: {
  html: string;
  path: string;
  /** Needed to fetch the report's relative images. Absent: rendered as-is. */
  workspaceId?: string | null;
}): React.JSX.Element {
  const [inlined, setInlined] = useState<{ from: string; html: string } | null>(null);

  useEffect(() => {
    if (!workspaceId) return;
    const ctrl = new AbortController();
    void inlineReportImages(html, path, (p) =>
      fetchWorkspaceImageDataUri(workspaceId, p, ctrl.signal)
    ).then((out) => {
      if (!ctrl.signal.aborted && out !== html) setInlined({ from: html, html: out });
    });
    return () => ctrl.abort();
  }, [html, path, workspaceId]);

  // Keyed on the source it was built from, so a stale result never outlives the
  // document it belongs to.
  const srcDoc = withSrcdocBase(inlined !== null && inlined.from === html ? inlined.html : html);

  return (
    <div className="not-prose flex flex-col gap-2">
      <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
        <i className="ti ti-file-type-html flex-none text-zinc-400" aria-hidden="true" />
        <span>Rendered without scripts</span>
        <span className="text-zinc-400 dark:text-zinc-600">·</span>
        {/* Said on screen, not only in a comment. A reader who wonders why an
            interactive page looks inert deserves the answer in front of them. */}
        <span>sandboxed, isolated from the app</span>
        {workspaceId && <OpenInBrowser workspaceId={workspaceId} path={path} />}
      </div>

      <iframe
        // Empty on purpose. See the note above: any allow-* token here would
        // undo the isolation this whole component is for.
        sandbox=""
        srcDoc={srcDoc}
        title={`Rendered document: ${path}`}
        data-testid="html-doc-frame"
        className="min-h-[70vh] w-full rounded-md border border-zinc-200 bg-white dark:border-zinc-800"
      />
    </div>
  );
}
