// TASK-1943 — the client sends the fence body it is showing, and understands the
// refusal it gets back.
//
// `fenceIndex` means the ADAPTER's index, resolved by a second implementation of
// listMermaidFences in another repository. If the two disagree, the model would
// be asked to rewrite a diagram the reader never selected — silently. Sending
// the text is what lets the adapter refuse instead.
//
// Asserted over the recorded request body, not over the screen: what is IN the
// request is the whole mechanism, and a screen cannot show it.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FenceEditor } from "../FenceEditor";
import { listMermaidFences } from "../../lib/mermaid-fences";

vi.mock("../MermaidBlock", () => ({
  MermaidBlock: ({ code }: { code: string }) => <div data-testid="mermaid-diagram">{code}</div>,
}));

// Two fences, so "the wrong one" is a real thing to land on.
const DOC = [
  "# doc",
  "",
  "```mermaid",
  "flowchart TD",
  "  FIRST-->A",
  "```",
  "",
  "prose",
  "",
  "```mermaid",
  "flowchart TD",
  "  SECOND-->B",
  "```",
  "",
].join("\n");

const FENCES = listMermaidFences(DOC);
const ETAG = "e".repeat(64);

let calls: { url: string; body: unknown }[] = [];
let responder: (url: string) => Response;

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  calls = [];
  responder = () => json(200, { mermaid: "flowchart TD\n  X-->Y", attempts: 1 });
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), body: init?.body });
    return Promise.resolve(responder(String(url)));
  });
  vi.stubGlobal("confirm", () => true);
});

afterEach(() => vi.unstubAllGlobals());

function mount(fenceIdx: number) {
  render(
    <FenceEditor
      workspaceId="main"
      rel="doc.md"
      markdown={DOC}
      etag={ETAG}
      fence={FENCES[fenceIdx]!}
      onSaved={vi.fn()}
      onClose={() => {}}
    />,
  );
}

function ask(): void {
  fireEvent.change(screen.getByTestId("fence-instruction"), { target: { value: "add a node" } });
  fireEvent.click(screen.getByTestId("fence-ask"));
}

const diagramCall = () => calls.find((c) => c.url.endsWith("/workspace-docs/diagram"));

describe("TASK-1943 — the client names the fence it is showing", () => {
  it("sends fenceText equal to the fence body, verbatim", () => {
    mount(1);
    ask();

    const sent = JSON.parse(String(diagramCall()?.body ?? "{}"));
    expect(sent.fenceIndex).toBe(1);
    // The body of fence 1, not fence 0 — a client that sent the wrong one would
    // make the adapter refuse every legitimate edit.
    expect(sent.fenceText).toBe("flowchart TD\n  SECOND-->B");
    expect(sent.fenceText).not.toContain("FIRST");
  });

  it("sends it VERBATIM, not normalised", () => {
    // A trimmed or re-joined copy would fail the adapter's comparison for a
    // difference nobody made, turning the precondition into a permanent 409.
    mount(0);
    ask();
    const sent = JSON.parse(String(diagramCall()?.body ?? "{}"));
    expect(sent.fenceText).toBe(FENCES[0]!.code);
  });

  it("a 409 is reported as a reload instruction, not as a model failure", async () => {
    responder = () =>
      json(409, {
        error: "fence text does not match",
        detail: "the client and the adapter disagree about fence 0 of doc.md. Reload the document…",
      });
    mount(0);
    ask();

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy();
    });
    const message = screen.getByRole("alert").textContent ?? "";
    // The only useful instruction. "The model failed to answer" would send a
    // reader into pressing again against a disagreement that never resolves.
    expect(message).toMatch(/reload/i);
    expect(message).toMatch(/nothing was changed/i);
    expect(message).not.toMatch(/model failed/i);
  });

  it("a 409 leaves the draft alone", async () => {
    responder = () => json(409, { error: "fence text does not match", detail: "…" });
    mount(0);
    const before = (screen.getByTestId("fence-source") as HTMLTextAreaElement).value;
    ask();
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    // Refused means nothing arrived — the editor must still hold what it held.
    expect((screen.getByTestId("fence-source") as HTMLTextAreaElement).value).toBe(before);
  });
});
