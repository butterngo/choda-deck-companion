// TASK-2143 — make a report's in-page #anchor links stay inside the report.
//
// A srcdoc document's base URL is its PARENT's URL. So `<a href="#shot-3">` in a
// report the Docs pane renders resolves to `http://127.0.0.1:<port>/#shot-3` —
// a different document — and the sandboxed frame navigates to the app's own
// index.html instead of scrolling to (or `:target`-ing) the anchor. Measured
// against the running app: the frame's URL became the app URL and its console
// filled with blocked-script and CORS errors for the app's assets.
//
// `<base href="about:srcdoc">` makes the same link resolve to
// `about:srcdoc#shot-3`, which is a same-document fragment navigation.

const BASE = `<base href="about:srcdoc">`;

/**
 * Insert the base tag where the parser will honour it without changing how the
 * document is parsed:
 *  · right after `<head …>` when there is one;
 *  · otherwise right after the doctype — never BEFORE it, which would drop the
 *    document into quirks mode and change its layout;
 *  · otherwise at the start (a document with no doctype is in quirks mode already).
 *
 * A document that declares its own <base> is left alone: the first <base> wins,
 * and overriding the author's is not this function's call.
 */
export function withSrcdocBase(html: string): string {
  if (/<base\b/i.test(html)) return html;

  const head = /<head\b[^>]*>/i.exec(html);
  if (head) return insertAt(html, head.index + head[0].length);

  const doctype = /^\s*(?:<!--[\s\S]*?-->\s*)*<!doctype\b[^>]*>/i.exec(html);
  if (doctype) return insertAt(html, doctype[0].length);

  return BASE + html;
}

function insertAt(html: string, at: number): string {
  return html.slice(0, at) + BASE + html.slice(at);
}
