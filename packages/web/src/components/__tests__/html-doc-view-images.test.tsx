// TASK-2142 — a report's relative <img src> is fetched by the app and inlined,
// because the sandboxed srcdoc frame can resolve neither the path nor the token.
//
// Every assertion here is over the REQUESTED URLS and the srcdoc ATTRIBUTE VALUE.
// "an image appeared" is not observable in jsdom and would prove nothing if it
// were: what matters is which path was asked for, and what the frame was handed.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { HtmlDocView } from "../HtmlDocView";
import { resolveReportImage } from "../../lib/report-images";
import { withSrcdocBase } from "../../lib/srcdoc-base";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

let fetchMock: ReturnType<typeof vi.fn>;

function respond(status: number, type: string, body: BodyInit = PNG): Response {
  return new Response(status === 200 ? body : "{}", { status, headers: { "content-type": type } });
}

beforeEach(() => {
  fetchMock = vi.fn(async () => respond(200, "image/png"));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const requested = (): string[] => fetchMock.mock.calls.map((c) => String(c[0]));
const frameDoc = (): string =>
  screen.getByTestId("html-doc-frame").getAttribute("srcdoc") ?? "";

describe("TASK-2142 — relative images are inlined", () => {
  it("AC-5 — resolves against the DOCUMENT's directory and inlines a data: URI", async () => {
    render(
      <HtmlDocView html={'<h1>r</h1><img alt="a" src="shots/a.png">'} path="docs/r/report.html" workspaceId="main" />
    );
    await waitFor(() => expect(frameDoc()).toContain("data:image/png;base64,"));
    expect(requested()).toEqual(["/api/workspace-docs/main/docs/r/shots/a.png"]);
    // The rest of the tag is untouched — only the value was spliced.
    expect(frameDoc()).toMatch(/<img alt="a" src="data:image\/png;base64,[^"]+">/);
  });

  it("AC-5 — a path referenced twice is fetched once and inlined in both places", async () => {
    render(
      <HtmlDocView html={"<img src='x.png'><img src=\"./x.png\">"} path="r.html" workspaceId="main" />
    );
    await waitFor(() => expect(frameDoc().match(/data:image\/png/g)?.length).toBe(2));
    expect(requested()).toEqual(["/api/workspace-docs/main/x.png"]);
  });

  it("AC-6 — absolute, protocol-relative, data: and root-escaping sources are never fetched", async () => {
    const html = [
      '<img src="http://example.com/a.png">',
      '<img src="https://example.com/b.png">',
      '<img src="//cdn.example.com/c.png">',
      '<img src="data:image/gif;base64,R0lGOD">',
      '<img src="../../../../x.png">',
    ].join("");
    render(<HtmlDocView html={html} path="docs/report.html" workspaceId="main" />);
    // Give any stray request the chance to be made before asserting none was.
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(frameDoc()).toBe(withSrcdocBase(html));
  });

  it("AC-7 — a 415 (older adapter) or 404 leaves the src as it was and the document rendered", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith("gone.png") ? respond(404, "application/json") : respond(415, "application/json")
    );
    const html = '<h1>Still here</h1><img src="a.png"><img src="gone.png">';
    render(<HtmlDocView html={html} path="report.html" workspaceId="main" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await new Promise((r) => setTimeout(r, 20));
    expect(frameDoc()).toBe(withSrcdocBase(html));
  });

  it("AC-7 — a 200 that is not labelled image/* is not inlined", async () => {
    fetchMock.mockImplementation(async () => respond(200, "text/html", "<script>x</script>"));
    const html = '<img src="a.png">';
    render(<HtmlDocView html={html} path="report.html" workspaceId="main" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(frameDoc()).toBe(withSrcdocBase(html));
  });

  it("AC-8 — the sandbox attribute stays present and empty after inlining", async () => {
    render(<HtmlDocView html={'<img src="a.png">'} path="report.html" workspaceId="main" />);
    await waitFor(() => expect(frameDoc()).toContain("data:image/png"));
    expect(screen.getByTestId("html-doc-frame").getAttribute("sandbox")).toBe("");
  });

  it("without a workspaceId nothing is fetched and the file renders as-is", async () => {
    render(<HtmlDocView html={'<img src="a.png">'} path="report.html" />);
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("resolveReportImage", () => {
  it("walks ./ and ../ inside the root, and refuses to leave it", () => {
    expect(resolveReportImage("docs/r/report.html", "shots/a.png")).toBe("docs/r/shots/a.png");
    expect(resolveReportImage("docs/r/report.html", "../img/a.png")).toBe("docs/img/a.png");
    expect(resolveReportImage("docs/r/report.html", "./a%20b.png?v=1#x")).toBe("docs/r/a b.png");
    expect(resolveReportImage("docs/report.html", "../../a.png")).toBeNull();
    expect(resolveReportImage("report.html", "/abs.png")).toBeNull();
    expect(resolveReportImage("report.html", "C:/x.png")).toBeNull();
  });
});
