// TASK-1798 — turn identifiers in a rendered source line into click targets.
//
// The obvious approach was to reuse highlight.js's own spans, and it does not
// work. The requirement's own line produces NO spans at all:
//
//   input : .AddEndpointFilter<Auth.ServiceTokenWorkspaceFilter>();
//   output: .AddEndpointFilter&lt;Auth.ServiceTokenWorkspaceFilter&gt;();
//
// `.cs` maps to `csharp` and the grammar loads; the highlighter simply marks
// nothing in that line. Borrowing its markup would have failed on the exact
// case the feature exists for, so the click targets are produced here.
//
// Why this parses HTML rather than running a regex over the string: the input
// is markup, and a regex would happily match inside `class="hljs-title"` and
// wrap an attribute value. Walking TEXT nodes is the only version that cannot
// touch anything but visible text.
//
// The round trip is also what keeps it safe. highlight.js escapes its input, so
// a `<script>` in the source file arrives here as `&lt;script&gt;`, parses as a
// text node containing those characters, and re-serialises escaped. Nothing in
// the source can become an element by passing through here.

/** A run of identifier characters. Deliberately language-agnostic. */
const IDENTIFIER = /[A-Za-z_][A-Za-z0-9_]*/g

/** The attribute a wrapped identifier carries. One name, used by both sides. */
export const SYMBOL_ATTR = 'data-symbol'

/**
 * Escape source text for injection as markup.
 *
 * Needed because the plain-text path — a file whose grammar has not loaded yet,
 * or failed — must offer the same click targets as the highlighted one. Without
 * this the two paths would behave differently and the difference would be
 * invisible until a language chunk happened to be slow.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

/**
 * Wrap every identifier in `html` with `<span data-symbol="Name">`, leaving the
 * markup around them — and the visible text — untouched.
 *
 * Returns the input unchanged when there is nothing to wrap, so a caller cannot
 * tell "no identifiers" from "wrapping was skipped" by looking at the output
 * length. That is intentional: the DOM assertion is the contract, not the string.
 */
export function wrapIdentifiers(html: string): string {
  if (typeof DOMParser === "undefined") return html
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html")
  const body = doc.body
  if (body === null) return html

  // Collect first, mutate after: replacing a text node while walking would
  // invalidate the walker's position, and the new spans contain text nodes of
  // their own that would then be re-visited forever.
  const walker = doc.createTreeWalker(body, 4 /* NodeFilter.SHOW_TEXT */)
  const texts: Text[] = []
  let node = walker.nextNode()
  while (node !== null) {
    texts.push(node as Text)
    node = walker.nextNode()
  }

  for (const text of texts) {
    const value = text.nodeValue ?? ""
    IDENTIFIER.lastIndex = 0
    if (!IDENTIFIER.test(value)) continue
    IDENTIFIER.lastIndex = 0

    const fragment = doc.createDocumentFragment()
    let cursor = 0
    let match = IDENTIFIER.exec(value)
    while (match !== null) {
      if (match.index > cursor) {
        fragment.appendChild(doc.createTextNode(value.slice(cursor, match.index)))
      }
      const span = doc.createElement("span")
      span.setAttribute(SYMBOL_ATTR, match[0])
      // Cursor only — NOT a button and NOT tabbable. A 500-line file holds
      // thousands of identifiers, and one tab stop each would bury every other
      // control on the page. This repo has already refused that trade twice
      // (CommitList.tsx:95, DocTree.tsx:116); v1 is mouse-only and says so.
      span.className = "cursor-pointer hover:underline"
      span.appendChild(doc.createTextNode(match[0]))
      fragment.appendChild(span)
      cursor = match.index + match[0].length
      match = IDENTIFIER.exec(value)
    }
    if (cursor < value.length) {
      fragment.appendChild(doc.createTextNode(value.slice(cursor)))
    }
    text.parentNode?.replaceChild(fragment, text)
  }

  return body.innerHTML
}

/**
 * The identifier a click landed on, or null when it landed on anything else.
 *
 * Resolved from the event target rather than from a per-identifier handler:
 * thousands of listeners on one file is the kind of cost that does not show up
 * in a test and does show up in a scroll.
 */
export function symbolFromEvent(target: EventTarget | null): string | null {
  if (target === null || !(target instanceof Element)) return null
  const el = target.closest(`[${SYMBOL_ATTR}]`)
  return el?.getAttribute(SYMBOL_ATTR) ?? null
}
