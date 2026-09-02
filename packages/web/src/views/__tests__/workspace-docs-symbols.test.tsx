// TASK-1798 — the journey: click a symbol, land on its declaration.
//
// Separate from workspace-docs.test.tsx because this file needs a PATH-AWARE
// document mock: the whole point is that the pane's content changes to a
// different file, and a mock returning one fixed body could not tell a
// successful jump from no jump at all.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { HealthView } from "../../hooks/use-health";
import type { SymbolMatch, WorkspaceDoc } from "../../api";
import { SYMBOL_ATTR } from "../../lib/symbols";

const outletValue: HealthView = {
  health: { loopAlive: true, lastPullAgeSec: 5, jwtState: "refresh", reachable: true },
  conn: "connected",
  lastFetchedAgoSec: 2,
};

const CALLER = 'app.MapPatch("/x").AddEndpointFilter<Auth.ServiceTokenWorkspaceFilter>();';
// Line 2 is the declaration — a jump that ignored the match's line would land
// on line 1 and this fixture would catch it.
const DECLARATION = `namespace Api.Auth;
public sealed class ServiceTokenWorkspaceFilter : IEndpointFilter`;

const FILES: Record<string, string> = {
  "src/Endpoints.cs": CALLER,
  "src/Auth/ServiceTokenAuth.cs": DECLARATION,
};

const DOCS: WorkspaceDoc[] = [
  { path: "src/Endpoints.cs", size: 100, modifiedAt: "2026-09-02T00:00:00.000Z" },
  { path: "src/Auth/ServiceTokenAuth.cs", size: 200, modifiedAt: "2026-09-02T00:00:00.000Z" },
];

let matches: SymbolMatch[] = [];
const asked: { workspaceId: string | null; name: string | null }[] = [];

vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useOutletContext: () => outletValue,
}));
vi.mock("../../hooks/use-workspace-docs", () => ({
  useWorkspaceDocs: () => ({
    docs: DOCS,
    cwd: "C:/dev/test/bpa-engine",
    label: "BE",
    isLoading: false,
    isError: false,
    missingFolder: null,
  }),
  useWorkspaceDoc: (_ws: string | null, path: string | null) => ({
    markdown: path === null ? null : (FILES[path] ?? null),
    isLoading: false,
    isError: false,
    isBinary: false,
  }),
}));
// Mocked for the same reason workspace-docs.test.tsx mocks it: the real picker
// pulls useWorkspaces, which needs a QueryClientProvider this test has no
// interest in supplying. INBOX-1892 is the standing note on exactly this.
vi.mock("../../components/WorkspaceSelect", () => ({
  WorkspaceSelect: ({ onSubmit }: { onSubmit: (id: string) => void }) => (
    <button type="button" data-testid="workspace-select" onClick={() => onSubmit("main")}>
      pick
    </button>
  ),
}));
vi.mock("../../hooks/use-workspace-symbols", () => ({
  useWorkspaceSymbols: (workspaceId: string | null, name: string | null) => {
    // Recording the arguments is how AC-4's "for the workspace the file belongs
    // to" half is proven at this level — the component test proves the name.
    asked.push({ workspaceId, name });
    return {
      name,
      matches: name === null ? [] : matches,
      isLoading: false,
      isError: false,
      isResolved: name !== null,
      // TASK-1799 — the view now branches on these too. Left false here so the
      // happy-path journeys below still describe the happy path.
      routeMissing: false,
      unknownWorkspace: false,
    };
  },
}));

const { WorkspaceDocsView } = await import("../WorkspaceDocsView");

function mount(): void {
  render(
    <MemoryRouter initialEntries={["/workspace-docs?workspaceId=main&path=src/Endpoints.cs"]}>
      <WorkspaceDocsView />
    </MemoryRouter>,
  );
}

const pre = (): HTMLElement => screen.getByTestId("doc-source");

async function clickSymbol(name: string): Promise<void> {
  await waitFor(() => expect(pre().querySelector(`[${SYMBOL_ATTR}="${name}"]`)).not.toBeNull());
  fireEvent.click(pre().querySelector(`[${SYMBOL_ATTR}="${name}"]`)!);
}

beforeEach(() => {
  matches = [];
  asked.length = 0;
});

describe("WorkspaceDocsView — symbol navigation", () => {
  // AC-5
  it("opens the declaration in the same pane, marked at the matched line", async () => {
    matches = [
      {
        path: "src/Auth/ServiceTokenAuth.cs",
        line: 2,
        kind: "class",
        text: "public sealed class ServiceTokenWorkspaceFilter : IEndpointFilter",
      },
    ];
    mount();
    expect(pre().textContent).toContain("MapPatch");

    await clickSymbol("ServiceTokenWorkspaceFilter");

    // The pane now shows the OTHER file...
    await waitFor(() => expect(pre().textContent).toContain("namespace Api.Auth"));
    expect(pre().textContent).not.toContain("MapPatch");
    // ...and the declaration's line is the marked one, not line 1.
    expect(screen.getByTestId("source-line-2").getAttribute("data-marked")).toBe("true");
    expect(screen.getByTestId("source-line-1").getAttribute("data-marked")).toBeNull();
  });

  // AC-4, workspace half
  it("resolves against the workspace the file belongs to", async () => {
    matches = [{ path: "src/Auth/ServiceTokenAuth.cs", line: 2, kind: "class", text: "" }];
    mount();
    await clickSymbol("ServiceTokenWorkspaceFilter");
    await waitFor(() =>
      expect(asked).toContainEqual({ workspaceId: "main", name: "ServiceTokenWorkspaceFilter" }),
    );
  });

  it("stays on the current file when the symbol resolves to nothing", async () => {
    // The control that keeps AC-5 honest: with no match, a viewer that
    // navigated anyway would still have "changed the pane" and looked correct
    // in the test above. Rendering the zero-match state is the sibling task's
    // job; not moving is this one's.
    matches = [];
    mount();
    await clickSymbol("ServiceTokenWorkspaceFilter");
    expect(pre().textContent).toContain("MapPatch");
  });

  // TASK-1799 AC-1 — several matches: the picker appears and the reader stays put.
  it("offers a picker for several matches, without leaving the current file", async () => {
    matches = [
      { path: "src/Auth/ServiceTokenAuth.cs", line: 2, kind: "class", text: "" },
      { path: "src/Endpoints.cs", line: 1, kind: "class", text: "" },
    ];
    mount();
    await clickSymbol("ServiceTokenWorkspaceFilter");

    await waitFor(() => expect(screen.getByTestId("symbol-picker")).toBeInTheDocument());
    // A guess would be indistinguishable from a correct jump once the reader is
    // looking at the wrong file, so nothing moves until a row is chosen.
    expect(pre().textContent).toContain("MapPatch");
  });

  // TASK-1799 AC-2 — choosing a row lands exactly where a single match would.
  it("opens the chosen match at its line", async () => {
    matches = [
      { path: "src/Auth/ServiceTokenAuth.cs", line: 2, kind: "class", text: "" },
      { path: "src/Endpoints.cs", line: 1, kind: "class", text: "" },
    ];
    mount();
    await clickSymbol("ServiceTokenWorkspaceFilter");
    await waitFor(() => expect(screen.getByTestId("symbol-picker")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("symbol-match-src/Auth/ServiceTokenAuth.cs:2"));

    await waitFor(() => expect(pre().textContent).toContain("namespace Api.Auth"));
    expect(screen.getByTestId("source-line-2").getAttribute("data-marked")).toBe("true");
    // And the picker is gone — a stale list hanging over the file just opened
    // would leave the reader unsure which of the two they are looking at.
    expect(screen.queryByTestId("symbol-picker")).not.toBeInTheDocument();
  });

  it("renders no picker for a single match — the control", async () => {
    matches = [{ path: "src/Auth/ServiceTokenAuth.cs", line: 2, kind: "class", text: "" }];
    mount();
    await clickSymbol("ServiceTokenWorkspaceFilter");
    await waitFor(() => expect(pre().textContent).toContain("namespace Api.Auth"));
    expect(screen.queryByTestId("symbol-picker")).not.toBeInTheDocument();
  });
});
