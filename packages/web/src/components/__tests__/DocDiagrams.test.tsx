// TASK-1781 — mermaid diagrams and GFM tables in the docs pane.
//
// The assertion that carries this file is the NEGATIVE one: a document with no
// mermaid fence must never import mermaid. Its paired control — the same spy
// recording exactly one import for a document that does have a fence — is what
// stops it passing vacuously on a build where mermaid was never wired at all.
// A zero-call assertion alone is satisfied by doing nothing.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

// Counts every call that actually reaches the mermaid module. This is the
// property under test — an earlier version counted MermaidBlock RENDERS, which
// is a different number: React re-renders the component after its own setState,
// so a correct implementation showed 2. Counting the module boundary instead
// measures what the AC is about.
const renderCalls: string[] = [];
let shouldThrow = false;

// Stands in for the real package so the suite neither downloads 84 MB nor
// depends on a headless SVG engine. It counts imports, which is the property
// under test — whether the chunk is pulled at all.
vi.mock("mermaid", () => ({
  default: {
    initialize: () => {},
    render: async (id: string, code: string) => {
      renderCalls.push(code);
      if (shouldThrow) throw new Error("Parse error on line 1");
      return { svg: `<svg data-id="${id}"><title>diagram</title></svg>` };
    },
  },
}));

const { CaptureMarkdown } = await import("../CaptureMarkdown");
const { listMermaidFences } = await import("../../lib/mermaid-fences");

const WITH_DIAGRAM = `# Doc

Some prose.

\`\`\`mermaid
graph TD; A-->B;
\`\`\`
`;

const WITHOUT_DIAGRAM = `# Doc

Some prose and a plain code block.

\`\`\`ts
const x = 1;
\`\`\`
`;

const WITH_TABLE = `| Pillar | Status |
| --- | --- |
| P1 | Decided |
| P5 | Shipped |
`;

beforeEach(() => {
  renderCalls.length = 0;
  shouldThrow = false;
});

describe("mermaid", () => {
  it("renders a fence as a diagram when diagrams are enabled", async () => {
    render(<CaptureMarkdown diagrams>{WITH_DIAGRAM}</CaptureMarkdown>);
    await waitFor(() => expect(screen.getByTestId("mermaid-diagram")).toBeTruthy());
    expect(renderCalls[0]).toContain("graph TD");
    // A surviving <pre><code> would mean the fence was never intercepted.
    expect(screen.queryByText(/graph TD; A-->B;/)).toBeNull();
  });

  it("never reaches mermaid for a document with no fence", async () => {
    render(<CaptureMarkdown diagrams>{WITHOUT_DIAGRAM}</CaptureMarkdown>);
    await waitFor(() => expect(screen.getByText("Some prose and a plain code block.")).toBeTruthy());
    expect(renderCalls).toEqual([]);
  });

  it("DOES reach mermaid exactly once for a document with one fence — the control", async () => {
    // Without this, the zero-call assertion above would pass on a build where
    // mermaid was never wired at all.
    render(<CaptureMarkdown diagrams>{WITH_DIAGRAM}</CaptureMarkdown>);
    await waitFor(() => expect(screen.getByTestId("mermaid-diagram")).toBeTruthy());
    expect(renderCalls).toHaveLength(1);
  });

  it("leaves the fence as a code block when diagrams are OFF", async () => {
    // The default everywhere except the docs pane: task bodies, knowledge
    // detail and conversation threads must not pull an 84 MB dependency.
    render(<CaptureMarkdown>{WITH_DIAGRAM}</CaptureMarkdown>);
    await waitFor(() => expect(screen.getByText("Some prose.")).toBeTruthy());
    expect(renderCalls).toEqual([]);
    expect(screen.queryByTestId("mermaid-diagram")).toBeNull();
  });

  it("names a parse failure and keeps the source, rather than blanking", async () => {
    shouldThrow = true;
    render(<CaptureMarkdown diagrams>{WITH_DIAGRAM}</CaptureMarkdown>);
    await waitFor(() => expect(screen.getByTestId("mermaid-error")).toBeTruthy());
    expect(screen.getByTestId("mermaid-error").textContent).toContain("Parse error on line 1");
    // The rest of the document still renders — one bad fence is not the page's
    // problem.
    expect(screen.getByText("Some prose.")).toBeTruthy();
  });
});

describe("GFM tables", () => {
  it("renders a pipe table as a real table, with one row per source row", () => {
    render(<CaptureMarkdown>{WITH_TABLE}</CaptureMarkdown>);
    const table = screen.getByRole("table");
    expect(table).toBeTruthy();
    // 1 header + 2 body rows. Without remark-gfm this is a paragraph of pipes.
    expect(table.querySelectorAll("tr")).toHaveLength(3);
    expect(screen.getByText("Shipped")).toBeTruthy();
  });

  it("applies to every caller, not only the docs pane", () => {
    // gfm is deliberately unconditional: ADR-031 and ADR-032 carry their
    // decisions in tables, and those are read through knowledge detail too.
    render(<CaptureMarkdown>{WITH_TABLE}</CaptureMarkdown>);
    expect(screen.getByRole("table")).toBeTruthy();
  });
});

// Edit, on the diagram itself.
//
// The number that matters is the INDEX the press reports. A button that always
// reports 0 looks identical on screen and writes to the wrong diagram, so the
// assertions here drive the SECOND fence of a two-fence document — the fixture
// is sized to the claim rather than to convenience.
//
// None of these wait for mermaid. The button is deliberately present in all
// three states of a block — drawing, drawn, failed — so asserting it needs no
// diagram to resolve. That is not only convenient: two blocks importing the
// 84 MB chunk at once is a real race, and a test that waited on it would be
// measuring the mock rather than the wiring.
describe("editing a diagram from the document", () => {
  const TWO_FENCES = `# Doc

\`\`\`mermaid
graph TD; A-->B;
\`\`\`

Then, after the change:

\`\`\`mermaid
graph TD; A-->C;
\`\`\`
`;

  const ONE_FENCE = `# Doc

\`\`\`mermaid
graph TD; A-->B;
\`\`\`
`;

  it("reports the index of the diagram that was pressed, not the first one", () => {
    const pressed: number[] = [];
    render(
      <CaptureMarkdown
        diagrams
        editFence={{ fences: listMermaidFences(TWO_FENCES), onEdit: (i) => pressed.push(i) }}
      >
        {TWO_FENCES}
      </CaptureMarkdown>,
    );
    const buttons = screen.getAllByTestId("diagram-edit");
    expect(buttons).toHaveLength(2);

    fireEvent.click(buttons[1]!);
    expect(pressed).toEqual([1]);

    // And the first still reports 0 — without this, a button reporting its
    // position in the DOM rather than the fence index would pass above.
    fireEvent.click(buttons[0]!);
    expect(pressed).toEqual([1, 0]);
  });

  it("labels each diagram with its own number", () => {
    render(
      <CaptureMarkdown diagrams editFence={{ fences: listMermaidFences(TWO_FENCES), onEdit: () => {} }}>
        {TWO_FENCES}
      </CaptureMarkdown>,
    );
    expect(screen.getByText("Diagram 1")).toBeTruthy();
    expect(screen.getByText("Diagram 2")).toBeTruthy();
  });

  it("drops the button rather than guessing when the fence list does not match", () => {
    // A list built from a DIFFERENT document — the shape of a line map that has
    // drifted. The blocks must still be there; only the shortcut goes away, and
    // the Diagrams list at the foot of the pane still reaches every fence.
    const { container } = render(
      <CaptureMarkdown
        diagrams
        editFence={{
          fences: listMermaidFences(["```mermaid", "graph TD; X-->Y;", "```", ""].join("\n")),
          onEdit: () => {},
        }}
      >
        {TWO_FENCES}
      </CaptureMarkdown>,
    );
    expect(container.querySelectorAll('[data-testid^="mermaid-"]')).toHaveLength(2);
    expect(screen.queryAllByTestId("diagram-edit")).toHaveLength(0);
  });

  it("CONTROL — no editFence, no buttons, and the blocks are still there", () => {
    // Everything but the docs pane. Without this, the zero-button assertion
    // above would pass on a build where the button was never wired.
    const { container } = render(<CaptureMarkdown diagrams>{TWO_FENCES}</CaptureMarkdown>);
    expect(container.querySelectorAll('[data-testid^="mermaid-"]')).toHaveLength(2);
    expect(screen.queryAllByTestId("diagram-edit")).toHaveLength(0);
  });

  it("offers Edit on a diagram that could not be drawn", async () => {
    // The commonest reason to want the editor at all. Withholding it here would
    // send the reader to the foot of the document precisely when the picture
    // they are looking at is broken. One fence, so the mocked module is not
    // raced and the error state is reached deterministically.
    shouldThrow = true;
    const pressed: number[] = [];
    render(
      <CaptureMarkdown
        diagrams
        editFence={{ fences: listMermaidFences(ONE_FENCE), onEdit: (i) => pressed.push(i) }}
      >
        {ONE_FENCE}
      </CaptureMarkdown>,
    );
    await waitFor(() => expect(screen.getByTestId("mermaid-error")).toBeTruthy());
    fireEvent.click(screen.getByTestId("diagram-edit"));
    expect(pressed).toEqual([0]);
  });
});
