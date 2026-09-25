// TASK-2145 AC-4 — the "Open in browser" button exists only where it can work
// (the packaged app's bridge is present AND the workspace is known), passes the
// workspace id and the workspace-relative path, and shows a refusal.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { HtmlDocView } from "../HtmlDocView";

const DOC = "<!doctype html><h1>r</h1>";

afterEach(() => {
  delete (window as unknown as { choda?: unknown }).choda;
});

function withBridge(openHtml: unknown): void {
  (window as unknown as { choda: unknown }).choda = { openFolder: vi.fn(), openHtml };
}

describe("TASK-2145 — Open in browser", () => {
  it("is not rendered without the bridge (browser shell)", () => {
    render(<HtmlDocView html={DOC} path="docs/r/report.html" workspaceId="main" />);
    expect(screen.queryByTestId("html-doc-open-browser")).toBeNull();
  });

  it("is not rendered without a workspaceId, even with the bridge", () => {
    withBridge(vi.fn());
    render(<HtmlDocView html={DOC} path="docs/r/report.html" />);
    expect(screen.queryByTestId("html-doc-open-browser")).toBeNull();
  });

  it("calls the bridge with (workspaceId, path)", async () => {
    const openHtml = vi.fn(async () => ({ ok: true }));
    withBridge(openHtml);
    render(<HtmlDocView html={DOC} path="docs/r/report.html" workspaceId="main" />);
    fireEvent.click(screen.getByTestId("html-doc-open-browser"));
    await waitFor(() => expect(openHtml).toHaveBeenCalledWith("main", "docs/r/report.html"));
    expect(screen.queryByTestId("html-doc-open-browser-error")).toBeNull();
  });

  it("shows the refusal reason rather than swallowing it", async () => {
    withBridge(vi.fn(async () => ({ ok: false, reason: "outside the workspace" })));
    render(<HtmlDocView html={DOC} path="docs/r/report.html" workspaceId="main" />);
    fireEvent.click(screen.getByTestId("html-doc-open-browser"));
    expect((await screen.findByTestId("html-doc-open-browser-error")).textContent).toBe("outside the workspace");
  });

  it("the frame's sandbox is untouched by the button", () => {
    withBridge(vi.fn());
    render(<HtmlDocView html={DOC} path="docs/r/report.html" workspaceId="main" />);
    expect(screen.getByTestId("html-doc-frame").getAttribute("sandbox")).toBe("");
  });
});
