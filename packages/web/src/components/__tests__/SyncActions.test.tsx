import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SyncActions } from "../SyncActions";
import * as api from "../../api";

function renderWithClient(ui: React.JSX.Element) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("SyncActions", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("does not call the adapter when the confirm is cancelled", async () => {
    const pull = vi.spyOn(api, "pullSync").mockResolvedValue({ upserted: 1 });
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const onDone = vi.fn();
    renderWithClient(<SyncActions onDone={onDone} />);
    screen.getByRole("button", { name: /pull/i }).click();
    expect(pull).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("pulls on confirm, surfaces the result, and refreshes the ledger", async () => {
    vi.spyOn(api, "pullSync").mockResolvedValue({ upserted: 3, tombstoned: 1 });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const onDone = vi.fn();
    renderWithClient(<SyncActions onDone={onDone} />);
    screen.getByRole("button", { name: /pull/i }).click();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/3 upserted, 1 removed/i));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("surfaces an error (e.g. endpoint missing) instead of a silent success", async () => {
    vi.spyOn(api, "pushSync").mockRejectedValue(new Error("HTTP 404 for /sync/push"));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderWithClient(<SyncActions onDone={vi.fn()} />);
    screen.getByRole("button", { name: /push/i }).click();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/push failed: HTTP 404/i));
  });
});
