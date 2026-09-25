// TASK-1956 AC-6 — an .html workspace file renders in a frame that cannot script.
//
// The assertion that carries this file is the sandbox ATTRIBUTE VALUE, not the
// presence of an iframe. An iframe with sandbox="allow-scripts allow-same-origin"
// renders the document identically and destroys the entire design, so a test that
// only finds the element proves nothing at all.

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HtmlDocView } from "../HtmlDocView";
import { isHtmlDoc, isMarkdown } from "../../views/WorkspaceDocsView";
import { withSrcdocBase } from "../../lib/srcdoc-base";

const DOC = "<!doctype html><title>t</title><h1>Rendered</h1><p>body</p>";

describe("TASK-1956 — HtmlDocView isolates what it renders", () => {
  it("renders inside an iframe rather than into this document", () => {
    render(<HtmlDocView html={DOC} path="docs/report.html" />);
    const frame = screen.getByTestId("html-doc-frame") as HTMLIFrameElement;
    expect(frame.tagName).toBe("IFRAME");
    // The bytes go to srcdoc — never into the parent document. The only
    // addition is TASK-2143's <base href="about:srcdoc">.
    expect(frame.getAttribute("srcdoc")).toBe(withSrcdocBase(DOC));
    // And they are NOT in the page itself. If someone swapped the frame for a
    // dangerouslySetInnerHTML, the heading would be findable here.
    expect(screen.queryByRole("heading", { name: "Rendered" })).toBeNull();
  });

  it("the sandbox attribute is present and grants NOTHING", () => {
    render(<HtmlDocView html={DOC} path="docs/report.html" />);
    const frame = screen.getByTestId("html-doc-frame");
    const sandbox = frame.getAttribute("sandbox");

    // Present. A missing attribute is a fully-privileged frame.
    expect(sandbox).not.toBeNull();
    // Empty. Every allow-* token is a hole, and these two are the fatal pair:
    // allow-scripts runs workspace code, allow-same-origin hands it this origin.
    expect(sandbox).toBe("");
    expect(sandbox).not.toMatch(/allow-scripts/);
    expect(sandbox).not.toMatch(/allow-same-origin/);
    expect(sandbox).not.toMatch(/allow-/);
  });

  it("says on screen that scripts did not run", () => {
    render(<HtmlDocView html={DOC} path="docs/report.html" />);
    // A reader whose interactive page looks inert should not have to guess why.
    expect(screen.getByText(/without scripts/i)).toBeTruthy();
  });

  it("names the document it framed, for the accessibility tree", () => {
    render(<HtmlDocView html={DOC} path="docs/report.html" />);
    expect(screen.getByTitle(/docs\/report\.html/)).toBeTruthy();
  });
});

describe("TASK-1956 — which files take the html branch", () => {
  it("claims .html and .htm, and nothing else", () => {
    expect(isHtmlDoc("docs/report.html")).toBe(true);
    expect(isHtmlDoc("docs/legacy.htm")).toBe(true);
    expect(isHtmlDoc("DOCS/REPORT.HTML")).toBe(true);

    // The controls. Each of these renders through a different path, and a
    // predicate written with `includes` rather than `endsWith` would claim the
    // last two.
    expect(isHtmlDoc("docs/guide.md")).toBe(false);
    expect(isHtmlDoc("src/app.ts")).toBe(false);
    expect(isHtmlDoc("docs/nothtml.ts")).toBe(false);
    expect(isHtmlDoc("docs/html-parser.ts")).toBe(false);
  });

  it("never claims a file markdown also claims", () => {
    for (const p of ["a.md", "a.html", "a.htm", "a.ts", "a.txt"]) {
      expect(isMarkdown(p) && isHtmlDoc(p)).toBe(false);
    }
  });
});
