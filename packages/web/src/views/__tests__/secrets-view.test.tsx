// Secrets screen: folder listing on open, groups load on demand, pins render
// without a read, copy and reveal by name. The bridge is stubbed on
// window.choda, as in project-vault.test.tsx.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, fireEvent, act } from "@testing-library/react";
import { SecretsView, type SecretEntry, type WorkspaceFiles } from "../SecretsView";

const WORKSPACES: WorkspaceFiles[] = [
  { workspaceId: "deck", workspaceLabel: "choda-deck", files: ["azure-foundry.txt", "sync-password.txt"] },
  { workspaceId: "cms", workspaceLabel: "headless-cms", files: ["github-pat.txt"] },
];

const ENTRIES: Record<string, SecretEntry[]> = {
  deck: [
    { workspaceId: "deck", workspaceLabel: "choda-deck", file: "azure-foundry.txt", key: "endpoint" },
    { workspaceId: "deck", workspaceLabel: "choda-deck", file: "sync-password.txt", key: "" },
  ],
  cms: [{ workspaceId: "cms", workspaceLabel: "headless-cms", file: "github-pat.txt", key: "" }],
};

function stubBridge(over: Record<string, unknown> = {}) {
  const api = {
    listSecretFiles: vi.fn(async () => ({ ok: true, workspaces: WORKSPACES })),
    listSecrets: vi.fn(async (ws: string) => ({ ok: true, entries: ENTRIES[ws] ?? [] })),
    copySecret: vi.fn(async () => ({ ok: true, clearsInSeconds: 45 })),
    revealSecret: vi.fn(async () => ({ ok: true, value: "s3cr3t" })),
    ...over,
  };
  vi.stubGlobal("choda", api);
  return api;
}

async function openGroup(label: string): Promise<HTMLElement> {
  const region = await screen.findByRole("region", { name: `${label} secrets` });
  fireEvent.click(within(region).getByRole("button", { expanded: false }));
  await within(region).findAllByTestId("secret-row");
  return region;
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

  it("opens with groups collapsed and reads no file until one is opened", async () => {
    const api = stubBridge();
    render(<SecretsView />);
    const deck = await screen.findByRole("region", { name: "choda-deck secrets" });
    expect(within(deck).getByText(/2 files/)).toBeTruthy();
    expect(screen.queryAllByTestId("secret-row")).toHaveLength(0);
    expect(api.listSecrets).not.toHaveBeenCalled();

    await openGroup("choda-deck");
    expect(api.listSecrets).toHaveBeenCalledTimes(1);
    expect(api.listSecrets).toHaveBeenCalledWith("deck");
    expect(screen.queryByTestId("secret-value")).toBeNull();

    // Closing and reopening uses what was already loaded.
    fireEvent.click(within(deck).getByRole("button", { expanded: true }));
    fireEvent.click(within(deck).getByRole("button", { expanded: false }));
    expect(api.listSecrets).toHaveBeenCalledTimes(1);
  });

  it("renders a pin straight from its name, without loading its group", async () => {
    window.localStorage.setItem("choda.secrets.pins", JSON.stringify(["cms|github-pat.txt|"]));
    const api = stubBridge();
    render(<SecretsView />);
    const pinned = await screen.findByRole("region", { name: "Pinned secrets" });
    expect(within(pinned).getByText("github-pat")).toBeTruthy();
    expect(within(pinned).getByText(/headless-cms ·/)).toBeTruthy();
    expect(api.listSecrets).not.toHaveBeenCalled();
  });

  it("hides a pin whose file is no longer listed", async () => {
    window.localStorage.setItem("choda.secrets.pins", JSON.stringify(["cms|deleted.txt|"]));
    stubBridge();
    render(<SecretsView />);
    const pinned = await screen.findByRole("region", { name: "Pinned secrets" });
    expect(within(pinned).queryByTestId("secret-row")).toBeNull();
  });

  it("moves a pinned entry to Pinned and keeps it after a remount", async () => {
    stubBridge();
    const { unmount } = render(<SecretsView />);
    await openGroup("headless-cms");
    fireEvent.click(screen.getByRole("button", { name: "Pin github-pat" }));
    const pinned = screen.getByRole("region", { name: "Pinned secrets" });
    expect(within(pinned).getByText("github-pat")).toBeTruthy();
    unmount();

    render(<SecretsView />);
    const again = await screen.findByRole("region", { name: "Pinned secrets" });
    expect(await within(again).findByText("github-pat")).toBeTruthy();
  });

  it("search opens and loads only the groups whose names match", async () => {
    const api = stubBridge();
    render(<SecretsView />);
    fireEvent.change(await screen.findByLabelText("Find a secret"), { target: { value: "azure" } });
    const deck = screen.getByRole("region", { name: "choda-deck secrets" });
    expect(await within(deck).findAllByTestId("secret-row")).toHaveLength(1);
    expect(screen.queryByRole("region", { name: "headless-cms secrets" })).toBeNull();
    expect(api.listSecrets).toHaveBeenCalledWith("deck");
    expect(api.listSecrets).not.toHaveBeenCalledWith("cms");
  });

  it("copies by name and reports the clipboard clear time", async () => {
    const api = stubBridge();
    render(<SecretsView />);
    await openGroup("choda-deck");
    fireEvent.click(screen.getByRole("button", { name: "Copy azure-foundry endpoint" }));
    await screen.findByText(/Copied azure-foundry › endpoint · clipboard clears in 45s/);
    expect(api.copySecret).toHaveBeenCalledWith("deck", "azure-foundry.txt", "endpoint");
  });

  it("shows a revealed value, then drops it after 10 seconds", async () => {
    const api = stubBridge();
    render(<SecretsView />);
    await openGroup("choda-deck");
    const eye = screen.getByRole("button", { name: "Show sync-password" });
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

  it("shows a refusal instead of swallowing it", async () => {
    stubBridge({ copySecret: vi.fn(async () => ({ ok: false, reason: "not found" })) });
    render(<SecretsView />);
    await openGroup("choda-deck");
    fireEvent.click(screen.getByRole("button", { name: "Copy sync-password" }));
    await screen.findByText("Could not copy sync-password: not found");
  });
});
