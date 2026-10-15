// Secrets screen: names from the bridge, pin to the top, copy and reveal by name.
// The bridge is stubbed on window.choda, as in project-vault.test.tsx.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within, fireEvent, act } from "@testing-library/react";
import { SecretsView, type SecretEntry } from "../SecretsView";

const ENTRIES: SecretEntry[] = [
  { workspaceId: "deck", workspaceLabel: "choda-deck", file: "sync-password.txt", key: "" },
  { workspaceId: "deck", workspaceLabel: "choda-deck", file: "azure-foundry.txt", key: "endpoint" },
  { workspaceId: "cms", workspaceLabel: "headless-cms", file: "github-pat.txt", key: "" },
];

function stubBridge(over: Record<string, unknown> = {}) {
  const api = {
    listSecrets: vi.fn(async () => ({ ok: true, entries: ENTRIES })),
    copySecret: vi.fn(async () => ({ ok: true, clearsInSeconds: 45 })),
    revealSecret: vi.fn(async () => ({ ok: true, value: "s3cr3t" })),
    ...over,
  };
  vi.stubGlobal("choda", api);
  return api;
}

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("SecretsView", () => {
  it("says it needs the desktop app when there is no bridge", () => {
    render(<SecretsView />);
    expect(screen.getByText("Secrets need the desktop app")).toBeTruthy();
  });

  it("groups entries by workspace and never renders a value up front", async () => {
    stubBridge();
    render(<SecretsView />);
    await screen.findByRole("region", { name: "choda-deck secrets" });
    expect(screen.getAllByTestId("secret-row")).toHaveLength(3);
    expect(screen.queryByTestId("secret-value")).toBeNull();
  });

  it("moves a pinned entry to Pinned and keeps it after a remount", async () => {
    stubBridge();
    const { unmount } = render(<SecretsView />);
    fireEvent.click(await screen.findByRole("button", { name: "Pin github-pat" }));
    const pinned = screen.getByRole("region", { name: "Pinned secrets" });
    expect(within(pinned).getByText("github-pat")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "headless-cms secrets" })).toBeNull();
    unmount();

    render(<SecretsView />);
    const again = await screen.findByRole("region", { name: "Pinned secrets" });
    await waitFor(() => expect(within(again).getByText("github-pat")).toBeTruthy());
  });

  it("copies by name and reports the clipboard clear time", async () => {
    const api = stubBridge();
    render(<SecretsView />);
    fireEvent.click(await screen.findByRole("button", { name: "Copy azure-foundry endpoint" }));
    await screen.findByText(/Copied azure-foundry › endpoint · clipboard clears in 45s/);
    expect(api.copySecret).toHaveBeenCalledWith("deck", "azure-foundry.txt", "endpoint");
  });

  it("shows a revealed value, then drops it after 10 seconds", async () => {
    const api = stubBridge();
    render(<SecretsView />);
    const eye = await screen.findByRole("button", { name: "Show sync-password" });
    vi.useFakeTimers();
    await act(async () => {
      fireEvent.click(eye);
    });
    expect(api.revealSecret).toHaveBeenCalledWith("deck", "sync-password.txt", "");
    expect(screen.getByTestId("secret-value").textContent).toContain("s3cr3t");
    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.queryByTestId("secret-value")).toBeNull();
  });

  it("filters by search text", async () => {
    stubBridge();
    render(<SecretsView />);
    fireEvent.change(await screen.findByLabelText("Find a secret"), { target: { value: "azure" } });
    expect(screen.getAllByTestId("secret-row")).toHaveLength(1);
  });

  it("shows a refusal instead of swallowing it", async () => {
    stubBridge({ copySecret: vi.fn(async () => ({ ok: false, reason: "not found" })) });
    render(<SecretsView />);
    fireEvent.click(await screen.findByRole("button", { name: "Copy sync-password" }));
    await screen.findByText("Could not copy sync-password: not found");
  });
});
