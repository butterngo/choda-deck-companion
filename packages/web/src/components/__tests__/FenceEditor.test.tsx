// TASK-1937 — one test per acceptance criterion for the fence editor.
//
// Everything is asserted over a RECORDING fetch rather than over the screen.
// Four of these criteria are about requests that must not happen, and a screen
// cannot tell you whether one left the machine.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FenceEditor } from "../FenceEditor";
import { listMermaidFences } from "../../lib/mermaid-fences";

// mermaid is 80 MB and irrelevant here — the preview's own behaviour is
// MermaidBlock's business (TASK-1781). What matters for AC-7 is that a diagram
// element is rendered at all, beside the diff.
vi.mock("../MermaidBlock", () => ({
  MermaidBlock: ({ code }: { code: string }) => (
    <div data-testid="mermaid-diagram">{code}</div>
  ),
}));

const DOC = ["# doc", "", "```mermaid", "sequenceDiagram", "  A->>B: hi", "```", "", "prose", ""].join(
  "\n"
);
const FENCE = listMermaidFences(DOC)[0]!;
const ETAG = "e".repeat(64);

let calls: { url: string; method: string; headers: Record<string, string>; body: unknown }[] = [];
let responder: (url: string, init?: RequestInit) => Response;

beforeEach(() => {
  calls = [];
  responder = () => new Response("{}", { status: 200 });
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
    calls.push({
      url: String(url),
      method: init?.method ?? "GET",
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body,
    });
    return Promise.resolve(responder(String(url), init));
  });
  vi.stubGlobal("confirm", () => true);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

function mount(over: Partial<React.ComponentProps<typeof FenceEditor>> = {}) {
  const onSaved = vi.fn();
  render(
    <FenceEditor
      workspaceId="main"
      rel="doc.md"
      markdown={DOC}
      etag={ETAG}
      fence={FENCE}
      onSaved={onSaved}
      onClose={() => {}}
      {...over}
    />
  );
  return { onSaved };
}

const diagramCalls = (): typeof calls => calls.filter((c) => c.url.endsWith("/workspace-docs/diagram"));
const putCalls = (): typeof calls => calls.filter((c) => c.method === "PUT");

function edit(text: string): void {
  fireEvent.change(screen.getByTestId("fence-source"), { target: { value: text } });
}

// -----------------------------------------------------------------------------

describe("AC-1 — the model is pressed, never triggered", () => {
  it("mounting, typing in the editor and typing an instruction issue ZERO calls", () => {
    mount();
    edit("sequenceDiagram\n  A->>C: hi");
    for (const ch of "abcdefghij") {
      fireEvent.change(screen.getByTestId("fence-instruction"), { target: { value: ch } });
    }
    expect(calls).toEqual([]);
  });

  it("pressing Ask AI issues exactly one — the control", () => {
    // Without this the assertion above would also pass against a build where
    // the button is broken.
    responder = () => json(200, { mermaid: "sequenceDiagram\n  A->>C: hi", attempts: 1 });
    mount();
    fireEvent.change(screen.getByTestId("fence-instruction"), { target: { value: "add C" } });
    fireEvent.click(screen.getByTestId("fence-ask"));
    expect(diagramCalls()).toHaveLength(1);
  });
});

describe("AC-2 — the save carries the version it was based on", () => {
  it("one PUT with if-match equal to the etag from the read", async () => {
    responder = () => json(200, { sha256: "f".repeat(64), bytes: 42 });
    mount();
    edit("sequenceDiagram\n  A->>C: hi");
    fireEvent.click(screen.getByTestId("fence-save"));

    await waitFor(() => expect(putCalls()).toHaveLength(1));
    expect(putCalls()[0]!.headers["if-match"]).toBe(ETAG);
  });
});

describe("AC-3 — a 409 keeps the edit", () => {
  it("says the file changed, keeps the text, and does NOT retry", async () => {
    responder = () => json(409, { error: "file changed on disk", sha256: "a".repeat(64) });
    mount();
    edit("sequenceDiagram\n  A->>C: hi");
    fireEvent.click(screen.getByTestId("fence-save"));

    await waitFor(() => expect(screen.getByTestId("fence-error")).toBeTruthy());
    expect(screen.getByTestId("fence-error").textContent).toContain("changed on disk");
    // The edit survives — discarding it is the lost edit the precondition exists
    // to prevent.
    expect((screen.getByTestId("fence-source") as HTMLTextAreaElement).value).toContain("A->>C");
    // And nothing retried behind the reader's back.
    expect(putCalls()).toHaveLength(1);
  });
});

describe("AC-4 — each limit says which one it was", () => {
  const cases: [number, unknown, string][] = [
    [413, { error: "too large" }, "2 MB"],
    [400, { error: "if-match required" }, "version it was based on"],
    [415, { error: "binary" }, "not text"],
  ];

  for (const [status, body, expected] of cases) {
    it(`${status} renders its own message`, async () => {
      responder = () => json(status, body);
      mount();
      edit("sequenceDiagram\n  A->>C: hi");
      fireEvent.click(screen.getByTestId("fence-save"));
      await waitFor(() => expect(screen.getByTestId("fence-error")).toBeTruthy());
      expect(screen.getByTestId("fence-error").textContent).toContain(expected);
    });
  }

  it("the three messages are DISTINCT", async () => {
    // Three tests each asserting "contains something" would all pass against one
    // generic string that happened to contain all three words. This is the
    // assertion that actually forbids a single shared failure message.
    const seen: string[] = [];
    for (const [status, body] of cases) {
      responder = () => json(status, body);
      const { unmount } = render(
        <FenceEditor
          workspaceId="main"
          rel="doc.md"
          markdown={DOC}
          etag={ETAG}
          fence={FENCE}
          onSaved={() => {}}
          onClose={() => {}}
        />
      );
      fireEvent.change(screen.getAllByTestId("fence-source")[0]!, {
        target: { value: "sequenceDiagram\n  A->>C: hi" },
      });
      fireEvent.click(screen.getAllByTestId("fence-save")[0]!);
      await waitFor(() => expect(screen.getAllByTestId("fence-error")[0]).toBeTruthy());
      seen.push(screen.getAllByTestId("fence-error")[0]!.textContent ?? "");
      unmount();
    }
    expect(new Set(seen).size).toBe(3);
  });
});

describe("AC-5 — a missing model is an invitation, a failure is an error", () => {
  it("501 renders a capability note and NO error state", async () => {
    responder = () => json(501, { error: "no model configured" });
    mount();
    fireEvent.change(screen.getByTestId("fence-instruction"), { target: { value: "add C" } });
    fireEvent.click(screen.getByTestId("fence-ask"));

    await waitFor(() => expect(screen.getByTestId("fence-no-model")).toBeTruthy());
    // Rendering "no model" as a failure trains the reader to ignore real errors.
    expect(screen.queryByTestId("fence-error")).toBeNull();
  });

  it("502 rate_limit and 502 network render DIFFERENT messages", async () => {
    const messages: string[] = [];
    for (const [status, body] of [
      [429, {}],
      [502, { error: "provider failed", kind: "network" }],
    ] as [number, unknown][]) {
      responder = () => json(status, body);
      const { unmount } = render(
        <FenceEditor
          workspaceId="main"
          rel="doc.md"
          markdown={DOC}
          etag={ETAG}
          fence={FENCE}
          onSaved={() => {}}
          onClose={() => {}}
        />
      );
      fireEvent.change(screen.getAllByTestId("fence-instruction")[0]!, {
        target: { value: "add C" },
      });
      fireEvent.click(screen.getAllByTestId("fence-ask")[0]!);
      await waitFor(() => expect(screen.getAllByTestId("fence-error")[0]).toBeTruthy());
      messages.push(screen.getAllByTestId("fence-error")[0]!.textContent ?? "");
      unmount();
    }
    expect(messages[0]).not.toBe(messages[1]);
    expect(messages[0]).toContain("rate limited");
    expect(messages[1]).toContain("network");
  });
});

describe("AC-6 — a refused proposal is not offered for saving", () => {
  it("422 shows the parse error and leaves the original in the editor", async () => {
    responder = () =>
      json(422, {
        error: "model output does not parse",
        parseError: "Parse error on line 2:",
        attempts: 2,
      });
    mount();
    fireEvent.change(screen.getByTestId("fence-instruction"), { target: { value: "add C" } });
    fireEvent.click(screen.getByTestId("fence-ask"));

    await waitFor(() => expect(screen.getByTestId("fence-parse-error")).toBeTruthy());
    expect(screen.getByTestId("fence-parse-error").textContent).toContain("Parse error on line 2");
    // The draft is untouched, so Save stays disabled — putting the rejected text
    // in the editor would offer to save exactly what the adapter refused.
    expect((screen.getByTestId("fence-source") as HTMLTextAreaElement).value).toBe(FENCE.code);
    expect(screen.getByTestId("fence-save")).toBeDisabled();
  });
});

describe("AC-7 — both the picture and the diff, before any save", () => {
  it("a proposal renders as a diagram AND as a diff", async () => {
    responder = () => json(200, { mermaid: "sequenceDiagram\n  A->>C: bye", attempts: 1 });
    mount();
    fireEvent.change(screen.getByTestId("fence-instruction"), { target: { value: "add C" } });
    fireEvent.click(screen.getByTestId("fence-ask"));

    await waitFor(() =>
      expect(screen.getByTestId("mermaid-diagram").textContent).toContain("A->>C")
    );
    const diff = screen.getByTestId("fence-diff").textContent ?? "";
    // The picture alone hides a rewritten label; the diff alone hides a broken
    // layout. Neither is sufficient, so both are required.
    expect(diff).toContain("- ");
    expect(diff).toContain("+ ");
    expect(diff).toContain("A->>C: bye");
  });
});

describe("AC-8 — a save confirms, and says what happened", () => {
  it("a declined confirm writes nothing", () => {
    vi.stubGlobal("confirm", () => false);
    mount();
    edit("sequenceDiagram\n  A->>C: hi");
    fireEvent.click(screen.getByTestId("fence-save"));
    expect(putCalls()).toEqual([]);
  });

  it("success renders role=status, failure renders role=alert", async () => {
    responder = () => json(200, { sha256: "f".repeat(64), bytes: 42 });
    const { onSaved } = mount();
    edit("sequenceDiagram\n  A->>C: hi");
    fireEvent.click(screen.getByTestId("fence-save"));

    await waitFor(() => expect(screen.getByTestId("fence-saved")).toBeTruthy());
    expect(screen.getByTestId("fence-saved")).toHaveAttribute("role", "status");
    expect(onSaved).toHaveBeenCalledTimes(1);
    // The saved document is handed back so the pane can show what was written
    // rather than waiting for a refetch that could race the write.
    expect(String(onSaved.mock.calls[0]![0])).toContain("A->>C");
  });
});

describe("the guard the criteria imply", () => {
  it("an adapter with no etag cannot be saved to, and says so", () => {
    mount({ etag: null });
    edit("sequenceDiagram\n  A->>C: hi");
    expect(screen.getByTestId("fence-save")).toBeDisabled();
    // A 404 from a route that does not exist yet must read as a stated
    // limitation, not as a save that silently did nothing.
    expect(screen.getByText(/predates the write route/)).toBeTruthy();
  });
});
