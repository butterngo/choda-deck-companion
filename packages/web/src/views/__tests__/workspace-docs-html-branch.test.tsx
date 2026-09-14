// TASK-1956 AC-6, the view half — the Docs pane sends .html to the sandboxed
// frame, and keeps sending .md and source files where they already went.
//
// Three destinations, one per file type, each asserted WITH the other two
// denied. A branch added in the wrong place — above the markdown test, say —
// would swallow .md files and still satisfy any test that only checked .html.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { HealthView } from "../../hooks/use-health";
import type { WorkspaceDoc } from "../../api";

const health: HealthView = {
  health: { loopAlive: true, lastPullAgeSec: 5, jwtState: "refresh", reachable: true },
  conn: "connected",
  lastFetchedAgoSec: 2,
};

const listState = {
  docs: [] as WorkspaceDoc[],
  cwd: "C:\\ws" as string | null,
  label: "Main" as string | null,
  isLoading: false,
  isError: false,
  missingFolder: null as { label: string; cwd: string } | null,
};
const docState = {
  markdown: null as string | null,
  etag: null as string | null,
  isLoading: false,
  isError: false,
  isBinary: false,
};

vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useOutletContext: () => health,
}));
vi.mock("../../hooks/use-workspace-docs", () => ({
  useWorkspaceDocs: () => listState,
  useWorkspaceDoc: () => docState,
}));
vi.mock("../../hooks/use-workspace-symbols", () => ({
  useWorkspaceSymbols: (_ws: string | null, name: string | null) => ({
    name,
    matches: [],
    isLoading: false,
    isError: false,
    isResolved: false,
    routeMissing: false,
    unknownWorkspace: false,
  }),
}));
vi.mock("../../components/WorkspaceSelect", () => ({
  WorkspaceSelect: ({ onSubmit }: { onSubmit: (id: string) => void }) => (
    <button type="button" data-testid="workspace-select" onClick={() => onSubmit("main")}>
      pick
    </button>
  ),
}));
// mermaid is 80 MB and needs layout jsdom has not got; this suite is about
// which branch renders, not about drawing.
vi.mock("../../components/MermaidBlock", () => ({
  MermaidBlock: ({ code }: { code: string }) => <pre data-testid="mermaid-diagram">{code}</pre>,
}));

import { WorkspaceDocsView } from "../WorkspaceDocsView";

const doc = (p: string): WorkspaceDoc => ({
  path: p,
  size: 10,
  modifiedAt: new Date().toISOString(),
});

function open(path: string, content: string): void {
  listState.docs = [doc("docs/report.html"), doc("docs/guide.md"), doc("src/app.ts")];
  docState.markdown = content;
  render(
    <MemoryRouter>
      <WorkspaceDocsView />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByTestId("workspace-select"));
  // The tree starts collapsed, so the file is not on screen until its folder
  // is opened. Clicking the leaf without this fails as "cannot find the text",
  // which reads like a routing bug and is not one.
  const folder = path.split("/").slice(0, -1).join("/");
  if (folder) fireEvent.click(screen.getByTestId(`doc-tree-folder-${folder}`));
  fireEvent.click(screen.getByText(path.split("/").pop() as string));
}

beforeEach(() => {
  listState.docs = [];
  docState.markdown = null;
  docState.isBinary = false;
});

describe("TASK-1956 — the Docs pane routes by file type", () => {
  it("an .html file goes to the sandboxed frame, not to markdown or source", () => {
    open("docs/report.html", "<h1>Rendered</h1>");

    const frame = screen.getByTestId("html-doc-frame");
    expect(frame.getAttribute("sandbox")).toBe("");
    expect(frame.getAttribute("srcdoc")).toContain("<h1>Rendered</h1>");

    // Denied destinations. Without these the branch could be rendering twice.
    expect(screen.queryByTestId("doc-markdown-measure")).toBeNull();
    // The raw HTML must not appear as text in the page — that would mean the
    // source view got it, or something injected it into this document.
    expect(screen.queryByRole("heading", { name: "Rendered" })).toBeNull();
  });

  it("a .md file still goes to the markdown path — the control", () => {
    open("docs/guide.md", "# heading\n\nbody");
    expect(screen.getByTestId("doc-markdown-measure")).toBeTruthy();
    expect(screen.queryByTestId("html-doc-frame")).toBeNull();
  });

  it("a .ts file still goes to source — the second control", () => {
    open("src/app.ts", "export const x = 1");
    expect(screen.queryByTestId("html-doc-frame")).toBeNull();
    expect(screen.queryByTestId("doc-markdown-measure")).toBeNull();
    // The source pane rendered it. Asserted by its own testid rather than by
    // the code text: SourceView splits every line into syntax-highlighted
    // spans, so a text matcher fails here for a reason that has nothing to do
    // with which branch ran.
    expect(screen.getByTestId("doc-source")).toBeTruthy();
    expect(screen.getByTestId("source-line-1")).toBeTruthy();
  });
});
