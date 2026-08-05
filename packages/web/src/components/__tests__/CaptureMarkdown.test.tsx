// TASK-1569 — render-level assertions: the right ELEMENT for the right artifact
// kind, with the rewritten URL. A .har in an <img> is a broken icon, so the
// img-vs-anchor split is the load-bearing behaviour here.

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CaptureMarkdown } from "../CaptureMarkdown";

describe("CaptureMarkdown", () => {
  it("AC-6: renders a capture image inline with the resolved src", () => {
    render(<CaptureMarkdown>{"![capture](captures/ab12.png)"}</CaptureMarkdown>);
    const img = screen.getByAltText("capture");
    expect(img).toHaveAttribute("src", "/api/artifacts/captures/ab12.png");
  });

  it("AC-2: resolves a legacy absolute path in an image ref", () => {
    render(
      <CaptureMarkdown>
        {"![capture](C:\\dev\\choda-deck\\data\\artifacts\\captures\\ab12.png)"}
      </CaptureMarkdown>,
    );
    expect(screen.getByAltText("capture")).toHaveAttribute(
      "src",
      "/api/artifacts/captures/ab12.png",
    );
  });

  it("AC-5: renders a HAR link as a download anchor, never an image", () => {
    render(<CaptureMarkdown>{"HAR bundle: [3 requests](captures/b1.har)"}</CaptureMarkdown>);
    const link = screen.getByRole("link", { name: "3 requests" });
    expect(link).toHaveAttribute("href", "/api/artifacts/captures/b1.har");
    expect(link).toHaveAttribute("download", "b1.har");
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("AC-5: a non-image artifact written as an image ref still becomes an anchor", () => {
    render(<CaptureMarkdown>{"![tokens](captures/t1.design.json)"}</CaptureMarkdown>);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "/api/artifacts/captures/t1.design.json",
    );
  });

  it("AC-4: leaves an external link untouched and opens it in a new tab", () => {
    render(<CaptureMarkdown>{"see [the docs](https://example.com/a)"}</CaptureMarkdown>);
    const link = screen.getByRole("link", { name: "the docs" });
    expect(link).toHaveAttribute("href", "https://example.com/a");
    expect(link).not.toHaveAttribute("download");
  });

  it("renders ordinary markdown structure as usual", () => {
    render(<CaptureMarkdown>{"# Title\n\nsome **bold** text"}</CaptureMarkdown>);
    expect(screen.getByRole("heading", { name: "Title" })).toBeInTheDocument();
    expect(screen.getByText("bold")).toBeInTheDocument();
  });

  it("renders a full capture body end to end", () => {
    const body =
      "![capture](captures/14211d9c.png)\n\n(70 bytes)\n\nSource: http://example.com/e2e";
    render(<CaptureMarkdown>{body}</CaptureMarkdown>);
    expect(screen.getByAltText("capture")).toHaveAttribute(
      "src",
      "/api/artifacts/captures/14211d9c.png",
    );
    expect(screen.getByText(/70 bytes/)).toBeInTheDocument();
  });
});
