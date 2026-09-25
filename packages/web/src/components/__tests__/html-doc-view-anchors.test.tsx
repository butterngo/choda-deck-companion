// TASK-2143 — a report's in-page #anchor links must stay inside the report.
//
// srcdoc inherits the PARENT's base URL, so without a <base> of its own an
// `<a href="#x">` in the frame resolves to the app's URL and loads the app in
// the frame. The assertions are over the srcdoc VALUE: where the base tag sits
// matters as much as whether it is there, because one placed before the
// doctype would switch the document into quirks mode.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { HtmlDocView } from "../HtmlDocView";
import { withSrcdocBase } from "../../lib/srcdoc-base";

const BASE = '<base href="about:srcdoc">';
const frameDoc = (): string => screen.getByTestId("html-doc-frame").getAttribute("srcdoc") ?? "";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TASK-2143 — the frame's base URL is about:srcdoc", () => {
  it("AC-1 — goes right after the <head> open tag", () => {
    const html = '<!doctype html><html><head lang="en"><title>t</title></head><body><a href="#x">x</a></body></html>';
    render(<HtmlDocView html={html} path="r.html" />);
    expect(frameDoc()).toBe(`<!doctype html><html><head lang="en">${BASE}<title>t</title></head><body><a href="#x">x</a></body></html>`);
  });

  it("AC-2 — with no <head>, goes after the doctype and never before it", () => {
    const html = "<!DOCTYPE html>\n<title>t</title><h1>r</h1>";
    render(<HtmlDocView html={html} path="r.html" />);
    expect(frameDoc().startsWith("<!DOCTYPE html>")).toBe(true);
    expect(frameDoc()).toBe(`<!DOCTYPE html>${BASE}\n<title>t</title><h1>r</h1>`);
    // A leading comment before the doctype is still honoured as "before it".
    expect(withSrcdocBase("<!-- c -->\n<!doctype html><p>x")).toBe(`<!-- c -->\n<!doctype html>${BASE}<p>x`);
  });

  it("AC-3 — a document with its own <base> gets no second one", () => {
    const html = '<!doctype html><head><base href="https://example.com/"></head><p>x';
    render(<HtmlDocView html={html} path="r.html" />);
    expect(frameDoc()).toBe(html);
    expect(frameDoc().match(/<base\b/gi)?.length).toBe(1);
  });

  it("AC-4 — image inlining still applies alongside, and the sandbox stays empty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new Uint8Array([0x89, 0x50]), { status: 200, headers: { "content-type": "image/png" } }))
    );
    render(<HtmlDocView html={'<!doctype html><head></head><img src="a.png">'} path="r.html" workspaceId="main" />);
    await waitFor(() => expect(frameDoc()).toContain("data:image/png;base64,"));
    expect(frameDoc()).toContain(`<head>${BASE}`);
    expect(screen.getByTestId("html-doc-frame").getAttribute("sandbox")).toBe("");
  });
});
