// TASK-1799 — the three answers that are not a jump.
//
// Every test here asserts the states it does NOT expect are absent, not merely
// that the one it wants is present. A panel rendering all four messages at once
// would pass any single presence check, and a panel collapsing them into one
// would pass every one of them.
//
// AC-4 and AC-5 live in this same file on purpose: the two 404s differ only by
// a body string, so an implementation that collapsed them must fail one test
// while the other still runs.

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SymbolLookupPanel } from "../SymbolLookupPanel";
import type { SymbolMatch } from "../../api";

const TWO: SymbolMatch[] = [
  { path: "src/a-dup.ts", line: 1, kind: "type", text: "export type Duplicated = 1" },
  { path: "src/b/dup.ts", line: 42, kind: "interface", text: "export interface Duplicated {}" },
];

/** Defaults are the resolved-with-nothing case; each test overrides one axis. */
function mount(over: Partial<React.ComponentProps<typeof SymbolLookupPanel>> = {}) {
  const props = {
    name: "Duplicated",
    matches: [] as SymbolMatch[],
    isLoading: false,
    isResolved: true,
    isError: false,
    routeMissing: false,
    unknownWorkspace: false,
    workspaceLabel: "Companion",
    onPick: vi.fn(),
    onDismiss: vi.fn(),
    ...over,
  };
  render(<SymbolLookupPanel {...props} />);
  return props;
}

/** The four mutually exclusive outcomes, by testid. */
const STATES = [
  "symbol-picker",
  "symbol-not-found",
  "symbol-adapter-outdated",
  "symbol-looking",
  "error-state",
] as const;

function only(present: (typeof STATES)[number]): void {
  expect(screen.getByTestId(present)).toBeInTheDocument();
  for (const other of STATES) {
    if (other === present) continue;
    expect(screen.queryByTestId(other)).not.toBeInTheDocument();
  }
}

describe("SymbolLookupPanel", () => {
  it("renders nothing at all when no symbol is pending", () => {
    const { container } = render(
      <SymbolLookupPanel
        name={null}
        matches={[]}
        isLoading={false}
        isResolved={false}
        isError={false}
        routeMissing={false}
        unknownWorkspace={false}
        workspaceLabel="Companion"
        onPick={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing while the lookup is still in flight", () => {
    // The distinction the hook's isResolved exists for: an empty match array
    // before the answer arrives is not the answer "none".
    const { container } = render(
      <SymbolLookupPanel
        name="Duplicated"
        matches={[]}
        isLoading={false}
        isResolved={false}
        isError={false}
        routeMissing={false}
        unknownWorkspace={false}
        workspaceLabel="Companion"
        onPick={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  // AC-1
  it("lists every match with its path and line", () => {
    mount({ matches: TWO });
    only("symbol-picker");
    expect(screen.getByText("src/a-dup.ts")).toBeInTheDocument();
    expect(screen.getByText("src/b/dup.ts")).toBeInTheDocument();
    expect(screen.getByText(":1")).toBeInTheDocument();
    expect(screen.getByText(":42")).toBeInTheDocument();
    expect(screen.getByTestId("symbol-picker")).toHaveTextContent("2 declarations of");
  });

  // AC-2
  it("hands back the chosen match, with its line", () => {
    const { onPick } = mount({ matches: TWO });
    fireEvent.click(screen.getByTestId("symbol-match-src/b/dup.ts:42"));
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith(TWO[1]);
    // Injection guard: handing back the FIRST match regardless of which row was
    // clicked is the plausible wrong implementation, and it fails here.
    expect(onPick).not.toHaveBeenCalledWith(TWO[0]);
  });

  // AC-3
  it("says no declaration was found, and names the workspace searched", () => {
    mount({ matches: [] });
    only("symbol-not-found");
    const note = screen.getByTestId("symbol-not-found");
    expect(note).toHaveTextContent("Duplicated");
    expect(note).toHaveTextContent("Companion");
    // Scope is this workspace only — the reader has to be told where NOT to
    // look, or "no declaration" reads as "does not exist anywhere".
    expect(note).toHaveTextContent(/only this workspace was searched/i);
  });

  it("does not say 'not found' when matches came back — the control", () => {
    mount({ matches: TWO });
    expect(screen.queryByTestId("symbol-not-found")).not.toBeInTheDocument();
  });

  // AC-4
  it("blames the app, not the code, when the adapter has no such route", () => {
    mount({ routeMissing: true });
    only("symbol-adapter-outdated");
    expect(screen.getByTestId("symbol-adapter-outdated")).toHaveTextContent(/update the companion/i);
  });

  // AC-5 — paired with AC-4 above; collapsing the two 404s fails one of them.
  it("reports an unknown workspace as a failure, not as an outdated app", () => {
    mount({ unknownWorkspace: true });
    only("error-state");
    expect(screen.getByTestId("error-state")).toHaveAttribute("data-variant", "failed");
    expect(screen.getByTestId("error-state")).toHaveTextContent("Companion");
  });

  // AC-6
  it("reports a genuine failure distinctly from both 404s and from not-found", () => {
    mount({ isError: true });
    only("error-state");
    expect(screen.getByTestId("error-state")).toHaveTextContent("Duplicated");
  });

  it("prefers the diagnosed 404 over the empty-match reading", () => {
    // Both arrive with matches: [] — the ordering inside the component is what
    // stops "nothing was searched" being reported as "nothing was found".
    mount({ matches: [], routeMissing: true });
    only("symbol-adapter-outdated");
  });

  it("can be dismissed", () => {
    const { onDismiss } = mount({ matches: TWO });
    fireEvent.click(screen.getByTestId("symbol-picker-dismiss"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  // TASK-1806 AC-1
  it("says it is looking while the scan is in flight", () => {
    mount({ isLoading: true, isResolved: false });
    only("symbol-looking");
    const note = screen.getByTestId("symbol-looking");
    expect(note).toHaveTextContent("Duplicated");
    expect(note).toHaveTextContent("Companion");
  });

  // TASK-1806 AC-2
  it("stops saying it once the answer arrives", () => {
    // The control is the pair: the note must be present in the first render and
    // absent in the second, so a panel that never renders it fails the first
    // half and one that never clears it fails the second.
    const { unmount } = render(
      <SymbolLookupPanel
        name="Duplicated"
        matches={[]}
        isLoading
        isResolved={false}
        isError={false}
        routeMissing={false}
        unknownWorkspace={false}
        workspaceLabel="Companion"
        onPick={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByTestId("symbol-looking")).toBeInTheDocument();
    unmount();

    mount({ matches: TWO, isLoading: false });
    expect(screen.queryByTestId("symbol-looking")).not.toBeInTheDocument();
    expect(screen.getByTestId("symbol-picker")).toBeInTheDocument();
  });

  // TASK-1806 AC-3
  it("says nothing when no symbol was ever clicked, even if a query is idle-loading", () => {
    const { container } = render(
      <SymbolLookupPanel
        name={null}
        matches={[]}
        isLoading
        isResolved={false}
        isError={false}
        routeMissing={false}
        unknownWorkspace={false}
        workspaceLabel="Companion"
        onPick={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("gives every row a keyboard-reachable control", () => {
    // The opposite call from TASK-1798's identifiers, and deliberately so: this
    // set is bounded, so each row is a real button.
    mount({ matches: TWO });
    expect(screen.getByTestId("symbol-picker").querySelectorAll("button")).toHaveLength(
      TWO.length + 1, // + dismiss
    );
  });
});
