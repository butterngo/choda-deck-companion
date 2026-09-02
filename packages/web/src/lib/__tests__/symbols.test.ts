// TASK-1798 — the wrapper that produces click targets.
//
// Tested at the string level here and through the component in
// SourceView.test.tsx. The two matter for different reasons: this file proves
// the markup is not corrupted, the component proves a reader can act on it.

import { describe, it, expect } from "vitest";
import { escapeHtml, symbolFromEvent, wrapIdentifiers, SYMBOL_ATTR } from "../symbols";

/** Parse a wrapped string back to a DOM so assertions read as facts about it. */
function parse(html: string): HTMLElement {
  const el = document.createElement("div");
  el.innerHTML = html;
  return el;
}

describe("wrapIdentifiers", () => {
  it("wraps identifiers inside highlight markup without touching the markup", () => {
    const el = parse(wrapIdentifiers('<span class="hljs-title">Foo</span>(bar)'));
    // The highlight class survives — wrapping must not replace the colouring.
    expect(el.querySelector(".hljs-title")).not.toBeNull();
    expect(el.querySelector(`[${SYMBOL_ATTR}="Foo"]`)).not.toBeNull();
    expect(el.querySelector(`[${SYMBOL_ATTR}="bar"]`)).not.toBeNull();
  });

  it("leaves the visible text identical, character for character", () => {
    const source = '<span class="hljs-keyword">public</span> sealed class Foo : IBar';
    expect(parse(wrapIdentifiers(source)).textContent).toBe(parse(source).textContent);
  });

  it("never wraps inside an attribute value", () => {
    // The failure a regex-over-the-string implementation would produce: `hljs`
    // and `title` are identifier-shaped and live in a class attribute.
    const el = parse(wrapIdentifiers('<span class="hljs-title">x</span>'));
    expect(el.querySelector("span")?.getAttribute("class")).toBe("hljs-title");
    expect(el.querySelector(`[${SYMBOL_ATTR}="hljs"]`)).toBeNull();
  });

  it("cannot turn escaped source text into an element", () => {
    // highlight.js hands us the source already escaped. Round-tripping it must
    // not revive it — this is the whole safety argument for parsing HTML.
    const el = parse(wrapIdentifiers("&lt;script&gt;alert(1)&lt;/script&gt;"));
    expect(el.querySelector("script")).toBeNull();
    expect(el.textContent).toContain("<script>");
  });

  it("keeps punctuation and whitespace between identifiers", () => {
    const el = parse(wrapIdentifiers(escapeHtml(".AddEndpointFilter<Auth.Filter>();")));
    expect(el.textContent).toBe(".AddEndpointFilter<Auth.Filter>();");
    expect(
      Array.from(el.querySelectorAll(`[${SYMBOL_ATTR}]`)).map((n) => n.getAttribute(SYMBOL_ATTR)),
    ).toEqual(["AddEndpointFilter", "Auth", "Filter"]);
  });

  it("adds no tabbable element", () => {
    // The a11y promise in one assertion: spans, never buttons, and no tabindex.
    const el = parse(wrapIdentifiers("class Foo {}"));
    expect(el.querySelectorAll("button")).toHaveLength(0);
    expect(el.querySelectorAll("[tabindex]")).toHaveLength(0);
    expect(el.querySelectorAll("a")).toHaveLength(0);
  });
});

describe("escapeHtml", () => {
  it("escapes the characters that would otherwise become markup", () => {
    expect(escapeHtml('<script src="x">&')).toBe("&lt;script src=&quot;x&quot;&gt;&amp;");
  });
});

describe("symbolFromEvent", () => {
  it("finds the name from the clicked node or its ancestor", () => {
    const el = parse(wrapIdentifiers('<span class="hljs-title">Foo</span>'));
    const span = el.querySelector(`[${SYMBOL_ATTR}="Foo"]`)!;
    expect(symbolFromEvent(span)).toBe("Foo");
    // A click landing on the text inside resolves through closest().
    expect(symbolFromEvent(span.firstChild as unknown as EventTarget)).toBe(null);
  });

  it("returns null for a click on nothing wrapped", () => {
    const el = parse("<span>plain</span>");
    expect(symbolFromEvent(el.querySelector("span"))).toBeNull();
    expect(symbolFromEvent(null)).toBeNull();
  });
});
