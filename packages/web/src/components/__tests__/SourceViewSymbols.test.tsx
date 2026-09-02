// TASK-1798 — identifiers as click targets, in the component that renders them.
//
// highlight.js is NOT mocked here either, and for a sharper reason than in
// SourceView.test.tsx: this feature exists because the real highlighter emits
// NO spans for the requirement's own line. A mock would have obligingly
// produced some, and the test would have passed against markup that never
// occurs.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SourceView } from "../SourceView";
import { resetHighlightCacheForTests } from "../../lib/highlight";
import { SYMBOL_ATTR } from "../../lib/symbols";

// The line from the report, verbatim. Its first token is on line 1 so the
// assertions can name a line rather than search the whole file.
const CSHARP = `app.MapPatch("/x").AddEndpointFilter<Auth.ServiceTokenWorkspaceFilter>();
public sealed class Order { }`;

const WITH_SCRIPT = `const danger = "<script>alert(1)</script>";`;

const pre = (): HTMLElement => screen.getByTestId("doc-source");
const symbols = (): HTMLElement[] =>
  Array.from(pre().querySelectorAll(`[${SYMBOL_ATTR}]`)) as HTMLElement[];

beforeEach(() => {
  resetHighlightCacheForTests();
  vi.restoreAllMocks();
});

describe("SourceView — symbol click targets", () => {
  // AC-1
  it("wraps the identifier from the endpoint-registration line with its exact name", async () => {
    render(<SourceView path="Endpoints.cs" code={CSHARP} onSymbolClick={vi.fn()} />);
    await waitFor(() => expect(symbols().length).toBeGreaterThan(0));
    const names = symbols().map((n) => n.getAttribute(SYMBOL_ATTR));
    expect(names).toContain("ServiceTokenWorkspaceFilter");
    // The neighbouring tokens are wrapped SEPARATELY — an implementation that
    // grabbed the whole generic argument would produce one blob instead.
    expect(names).toContain("Auth");
    expect(names).not.toContain("Auth.ServiceTokenWorkspaceFilter");
  });

  // AC-2
  it("leaves the rendered text and the highlight classes intact", async () => {
    const { unmount } = render(
      <SourceView path="Endpoints.cs" code={CSHARP} onSymbolClick={vi.fn()} />,
    );
    // Waits for HIGHLIGHTING, not merely for symbols. With symbols on, the
    // wrapped spans appear on the plain-text path before any grammar loads —
    // so waiting on them would measure the pre-highlight frame and compare two
    // zeroes. The first version of this test did exactly that, and only the
    // last assertion below caught it.
    await waitFor(() => expect(pre().querySelectorAll('[class*="hljs-"]').length).toBeGreaterThan(0));
    const wrappedText = pre().textContent;
    const wrappedClasses = pre().querySelectorAll('[class*="hljs-"]').length;
    expect(symbols().length).toBeGreaterThan(0);
    unmount();

    // The same file with symbols OFF is the control: text and colouring must
    // be identical, so wrapping is provably additive.
    render(<SourceView path="Endpoints.cs" code={CSHARP} />);
    await waitFor(() => expect(pre().querySelectorAll('[class*="hljs-"]').length).toBeGreaterThan(0));
    expect(pre().textContent).toBe(wrappedText);
    expect(pre().querySelectorAll('[class*="hljs-"]').length).toBe(wrappedClasses);
    expect(wrappedClasses).toBeGreaterThan(0); // else the class assertion proves nothing
  });

  // AC-3
  it("cannot revive a script tag that appears in the source text", async () => {
    render(<SourceView path="danger.ts" code={WITH_SCRIPT} onSymbolClick={vi.fn()} />);
    await waitFor(() => expect(symbols().length).toBeGreaterThan(0));
    expect(pre().querySelector("script")).toBeNull();
    expect(pre().textContent).toContain("<script>alert(1)</script>");
  });

  // AC-4
  it("reports the clicked identifier, and nothing adjacent", async () => {
    const onSymbolClick = vi.fn();
    render(<SourceView path="Endpoints.cs" code={CSHARP} onSymbolClick={onSymbolClick} />);
    await waitFor(() => expect(symbols().length).toBeGreaterThan(0));
    const target = symbols().find(
      (n) => n.getAttribute(SYMBOL_ATTR) === "ServiceTokenWorkspaceFilter",
    )!;
    fireEvent.click(target);
    expect(onSymbolClick).toHaveBeenCalledTimes(1);
    expect(onSymbolClick).toHaveBeenCalledWith("ServiceTokenWorkspaceFilter");
  });

  it("stays silent when the click lands on punctuation", async () => {
    // Without this, "the handler fires" would be satisfied by a handler that
    // fires on every click with whatever text happened to be nearby.
    const onSymbolClick = vi.fn();
    render(<SourceView path="Endpoints.cs" code={CSHARP} onSymbolClick={onSymbolClick} />);
    await waitFor(() => expect(symbols().length).toBeGreaterThan(0));
    fireEvent.click(pre());
    expect(onSymbolClick).not.toHaveBeenCalled();
  });

  // AC-6
  it("offers nothing and says why when the language is not recognised", async () => {
    render(<SourceView path="notes.unknownext" code="some words here" onSymbolClick={vi.fn()} />);
    expect(screen.getByTestId("symbols-unavailable")).toBeInTheDocument();
    expect(symbols()).toHaveLength(0);
    expect(pre().getAttribute("data-symbols")).toBe("off");
  });

  it("says nothing about symbols in a pane that never offered them", () => {
    // The control for the note itself: a read-only pane must not grow an
    // explanation about a feature it does not have.
    render(<SourceView path="notes.unknownext" code="some words here" />);
    expect(screen.queryByTestId("symbols-unavailable")).not.toBeInTheDocument();
  });

  // AC-7 — the a11y promise, measured rather than asserted in prose.
  it("adds no focusable element to a long file", async () => {
    const long = Array.from({ length: 200 }, (_, i) => `public class Type${i} { }`).join("\n");
    const focusable = "a[href], button, input, select, textarea, [tabindex]";

    const { unmount } = render(<SourceView path="Big.cs" code={long} />);
    await waitFor(() => screen.getByTestId("source-line-html-1"));
    const before = pre().querySelectorAll(focusable).length;
    unmount();

    render(<SourceView path="Big.cs" code={long} onSymbolClick={vi.fn()} />);
    await waitFor(() => expect(symbols().length).toBeGreaterThan(0));
    expect(pre().querySelectorAll(focusable).length).toBe(before);
    // And the file really did get click targets — otherwise the count above is
    // equal for the boring reason.
    expect(symbols().length).toBeGreaterThan(200);
  });
});
