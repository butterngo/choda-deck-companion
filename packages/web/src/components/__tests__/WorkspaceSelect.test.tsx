import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WorkspaceSelect } from "../WorkspaceSelect";
import * as api from "../../api";

function renderWithClient(ui: React.JSX.Element) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("WorkspaceSelect", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("renders a dropdown populated from GET /workspaces and submits the selected id", async () => {
    vi.spyOn(api, "fetchWorkspaces").mockResolvedValue({
      workspaces: [
        { id: "choda-deck-companion", projectId: "choda-deck", label: "Companion", cwd: "C:/x", archivedAt: null },
        { id: "main", projectId: "choda-deck", label: "Main", cwd: "C:/y", archivedAt: null },
      ],
    });
    const onSubmit = vi.fn();
    renderWithClient(<WorkspaceSelect onSubmit={onSubmit} />);

    await waitFor(() => expect(screen.getByText(/Companion \(choda-deck\)/)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/workspace:/i), { target: { value: "main" } });
    fireEvent.click(screen.getByRole("button", { name: /load/i }));
    expect(onSubmit).toHaveBeenCalledWith("main");
  });

  it("falls back to the manual text-entry when the endpoint errors", async () => {
    vi.spyOn(api, "fetchWorkspaces").mockRejectedValue(new Error("HTTP 500"));
    renderWithClient(<WorkspaceSelect onSubmit={vi.fn()} />);
    await waitFor(() => expect(screen.getByLabelText(/workspace id:/i)).toBeInTheDocument());
  });

  it("falls back to the manual text-entry when the list is empty", async () => {
    vi.spyOn(api, "fetchWorkspaces").mockResolvedValue({ workspaces: [] });
    renderWithClient(<WorkspaceSelect onSubmit={vi.fn()} />);
    await waitFor(() => expect(screen.getByLabelText(/workspace id:/i)).toBeInTheDocument());
  });

  it("manual fallback still submits the typed id", async () => {
    vi.spyOn(api, "fetchWorkspaces").mockResolvedValue({ workspaces: [] });
    const onSubmit = vi.fn();
    renderWithClient(<WorkspaceSelect onSubmit={onSubmit} />);
    await waitFor(() => expect(screen.getByLabelText(/workspace id:/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/workspace id:/i), { target: { value: "typed-id" } });
    fireEvent.click(screen.getByRole("button", { name: /load/i }));
    expect(onSubmit).toHaveBeenCalledWith("typed-id");
  });
});
