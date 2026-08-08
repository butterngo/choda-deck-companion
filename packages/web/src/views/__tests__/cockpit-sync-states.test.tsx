// TASK-1596 AC-2 — the disconnected / query-failed split.
//
// Both views previously rendered ONE branch for `conn === "disconnected" ||
// isError`, sharing a single message. This asserts they now diverge: a view
// that still passed one variant for both fails the `not.toBe` comparison,
// which is the whole point of the criterion.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { HealthView } from "../../hooks/use-health";

const health = (conn: HealthView["conn"]): HealthView => ({
  health: { loopAlive: true, lastPullAgeSec: 5, jwtState: "refresh", reachable: conn !== "disconnected" },
  conn,
  lastFetchedAgoSec: 2,
});

let outletValue: HealthView = health("connected");
const focusState = { feed: null as unknown, isLoading: false, isError: false, refetch: vi.fn() };
const ledgerState = { rows: [] as unknown[], isLoading: false, isError: false, refetch: vi.fn() };

vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useOutletContext: () => outletValue,
}));
vi.mock("../../hooks/use-workspace", () => ({
  useWorkspace: () => ({ workspaceId: "w1", setWorkspaceId: vi.fn() }),
}));
vi.mock("../../hooks/use-focus", () => ({ useFocus: () => focusState }));
vi.mock("../../hooks/use-inbox", () => ({
  useInbox: () => ({ items: [], isLoading: false, isError: false, refetch: vi.fn() }),
}));
vi.mock("../../hooks/use-ledger", () => ({ useLedger: () => ledgerState }));
vi.mock("../../hooks/use-sync-log", () => ({
  useSyncLog: () => ({ events: [], isLoading: false, isError: false, refetch: vi.fn() }),
}));
// SyncActions/WorkflowActions issue mutations; not under test here.
vi.mock("../../components/SyncActions", () => ({ SyncActions: () => null }));
vi.mock("../../components/WorkflowActions", () => ({ WorkflowActions: () => null }));

const { CockpitView } = await import("../CockpitView");
const { SyncView } = await import("../SyncView");

beforeEach(() => {
  outletValue = health("connected");
  focusState.isError = false;
  focusState.isLoading = false;
  ledgerState.isError = false;
  ledgerState.isLoading = false;
});

describe.each([
  ["CockpitView", () => <CockpitView />, focusState, /board is unavailable/i],
  ["SyncView", () => <SyncView />, ledgerState, /ledger is unavailable/i],
] as const)("%s state branches", (_name, View, state, unreachableCopy) => {
  it("renders variant=unreachable when the API is unreachable", () => {
    outletValue = health("disconnected");
    render(<View />);
    const el = screen.getByTestId("error-state");
    expect(el).toHaveAttribute("data-variant", "unreachable");
    expect(screen.getByText(/Can.t reach the laptop API/)).toBeInTheDocument();
    expect(screen.getByText(unreachableCopy)).toBeInTheDocument();
  });

  it("renders variant=failed when the query failed but the API answered", () => {
    state.isError = true;
    render(<View />);
    const el = screen.getByTestId("error-state");
    expect(el).toHaveAttribute("data-variant", "failed");
    // The discriminator: a failed query must NOT claim the laptop is unreachable.
    expect(screen.queryByText(/Can.t reach the laptop API/)).toBeNull();
  });

  it("produces different output for the two failures", () => {
    outletValue = health("disconnected");
    const { container: unreachable } = render(<View />);
    const unreachableHtml = unreachable.innerHTML;

    outletValue = health("connected");
    state.isError = true;
    const { container: failed } = render(<View />);

    expect(unreachableHtml).not.toBe(failed.innerHTML);
  });

  it("renders a skeleton, not bare text, while loading", () => {
    state.isLoading = true;
    render(<View />);
    expect(screen.getByTestId("skeleton")).toBeInTheDocument();
  });
});
