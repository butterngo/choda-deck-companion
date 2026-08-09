// TASK-1602 — search behaviour, moved here from KnowledgeSearchBox.test.tsx.
//
// The three assertions below are the ORIGINAL ones, unchanged in meaning:
// results render and are selectable, a disabled provider is not an error, and a
// real fetch failure is. They moved because the behaviour moved — the box no
// longer owns the result, so the view is the only place they can be observed.
// Nothing was weakened to make anything pass.
//
// The rest are new, covering what this task actually changed: results replace
// the list instead of stacking above it.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import * as api from "../../api";
import type { HealthView } from "../../hooks/use-health";

const health: HealthView = {
  health: { loopAlive: true, lastPullAgeSec: 3, jwtState: "refresh", reachable: true },
  conn: "connected",
  lastFetchedAgoSec: 1,
};

vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useOutletContext: () => health,
}));

const entry = (slug: string, title: string) => ({
  slug,
  projectId: "p1",
  workspaceId: null,
  scope: "project" as const,
  type: "gotcha" as const,
  title,
  filePath: `docs/knowledge/${slug}.md`,
  createdAt: "2026-01-01T00:00:00.000Z",
  lastVerifiedAt: "2026-01-01T00:00:00.000Z",
});

vi.mock("../../hooks/use-knowledge", () => ({
  useKnowledgeList: () => ({
    entries: [
      { ...entry("browse-1", "A browsable entry"), type: "decision" },
      { ...entry("browse-2", "Another browsable entry"), type: "decision" },
    ],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useKnowledgeEntry: () => ({ entry: null, isLoading: false, isError: false }),
}));

const { KnowledgeView } = await import("../KnowledgeView");

function view() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <KnowledgeView />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

async function searchFor(term: string) {
  fireEvent.change(screen.getByPlaceholderText(/search knowledge/i), { target: { value: term } });
  fireEvent.submit(screen.getByPlaceholderText(/search knowledge/i).closest("form")!);
}

describe("Knowledge search", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  // ── the three original KnowledgeSearchBox assertions ──────────────────
  it("shows results and selects one when clicked", async () => {
    vi.spyOn(api, "searchKnowledgeEntries").mockResolvedValue({
      enabled: true,
      results: [{ ...entry("gotcha-1", "Gotcha one"), distance: 0.1 }],
    });
    view();
    await searchFor("cap");
    await waitFor(() => expect(screen.getByText("Gotcha one")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Gotcha one"));
    expect(screen.getByRole("button", { name: /Gotcha one/ })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("treats a disabled provider as a capability gap, not an error", async () => {
    vi.spyOn(api, "searchKnowledgeEntries").mockResolvedValue({
      enabled: false,
      reason: "embedding store not configured",
      results: [],
    });
    view();
    await searchFor("cap");
    await waitFor(() =>
      expect(screen.getByText(/embedding store not configured/i)).toBeInTheDocument()
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("surfaces a real fetch failure as an alert", async () => {
    vi.spyOn(api, "searchKnowledgeEntries").mockRejectedValue(new Error("HTTP 500"));
    view();
    await searchFor("cap");
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/search failed/i));
  });

  // ── what TASK-1602 changed ────────────────────────────────────────────
  it("REPLACES the entry list with results, rather than stacking above it", async () => {
    // The criterion of this task. The old version rendered results above the
    // full list, so the pane held two competing lists and the type filter kept
    // applying to the one underneath.
    vi.spyOn(api, "searchKnowledgeEntries").mockResolvedValue({
      enabled: true,
      results: [{ ...entry("gotcha-1", "Gotcha one"), distance: 0.1 }],
    });
    view();
    expect(screen.getByText("A browsable entry")).toBeInTheDocument();

    await searchFor("cap");

    await waitFor(() => expect(screen.getByLabelText("search results")).toBeInTheDocument());
    expect(screen.queryByLabelText("knowledge entries")).toBeNull();
    expect(screen.queryByText("A browsable entry")).toBeNull();
  });

  it("restores the browse list from the result bar", async () => {
    vi.spyOn(api, "searchKnowledgeEntries").mockResolvedValue({
      enabled: true,
      results: [{ ...entry("gotcha-1", "Gotcha one"), distance: 0.1 }],
    });
    view();
    await searchFor("cap");
    await waitFor(() => expect(screen.getByLabelText("search results")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /back to all entries/i }));

    expect(screen.getByLabelText("knowledge entries")).toBeInTheDocument();
    expect(screen.queryByLabelText("search results")).toBeNull();
  });

  it("keeps the entry list usable when the provider is off", async () => {
    // A capability gap must not take the pane into results mode — browsing is
    // still the point.
    vi.spyOn(api, "searchKnowledgeEntries").mockResolvedValue({
      enabled: false,
      reason: "embedding deps unavailable",
      results: [],
    });
    view();
    await searchFor("cap");
    await waitFor(() => expect(screen.getByText(/embedding deps unavailable/i)).toBeInTheDocument());
    expect(screen.getByLabelText("knowledge entries")).toBeInTheDocument();
  });

  it("renders an excerpt without highlighting it — the search is semantic", async () => {
    // A hit may share no literal term with the query, so marking one would
    // claim a match that is not there.
    vi.spyOn(api, "searchKnowledgeEntries").mockResolvedValue({
      enabled: true,
      results: [
        { ...entry("gotcha-1", "Gotcha one"), distance: 0.1, excerpt: "Leading prose of the entry." },
      ],
    });
    view();
    await searchFor("cap");
    const results = await screen.findByLabelText("search results");
    expect(within(results).getByText("Leading prose of the entry.")).toBeInTheDocument();
    expect(results.querySelector("mark")).toBeNull();
  });

  it("renders a hit with no excerpt at all — older adapters omit the field", async () => {
    // Confirmed against the live adapter while building this: an instance
    // predating TASK-1599 sends no `excerpt`, so the field must be optional in
    // practice and not merely in the type.
    vi.spyOn(api, "searchKnowledgeEntries").mockResolvedValue({
      enabled: true,
      results: [{ ...entry("gotcha-1", "Gotcha one"), distance: 0.1 }],
    });
    view();
    await searchFor("cap");
    const results = await screen.findByLabelText("search results");
    expect(within(results).getByText("Gotcha one")).toBeInTheDocument();
    expect(within(results).queryByText("undefined")).toBeNull();
  });

  it("says NEAREST, not results — semantic search never reports a miss", async () => {
    // Found by testing against the live adapter: `zzzqqqxyzzy` came back with
    // 5 "results" at distances 1.286-1.313. There is no relevance threshold, so
    // the provider always returns its top-K and calling them "results" claims
    // matches that do not exist.
    //
    // No cutoff is guessed here — the sibling gotcha
    // `sweep-threshold-constants-against-real-fixtures` is about exactly that
    // mistake. The wording is what can be made honest without one.
    vi.spyOn(api, "searchKnowledgeEntries").mockResolvedValue({
      enabled: true,
      results: [
        { ...entry("far-1", "A distant entry"), distance: 1.31 },
        { ...entry("far-2", "Another distant entry"), distance: 1.32 },
      ],
    });
    view();
    await searchFor("zzzqqqxyzzy");
    await waitFor(() => expect(screen.getByText(/nearest to/i)).toBeInTheDocument());
    expect(screen.queryByText(/\d+ results? for/i)).toBeNull();
  });

  it("keeps an empty answer distinguishable from a distant one", async () => {
    // Reachable only when the store is empty or unembedded, since an enabled
    // provider always returns its top-K. Kept as a guard.
    vi.spyOn(api, "searchKnowledgeEntries").mockResolvedValue({ enabled: true, results: [] });
    view();
    await searchFor("xyzzy");
    await waitFor(() => expect(screen.getByText(/Nothing returned for/i)).toBeInTheDocument());
    expect(screen.getByText(/Nothing returned for/i)).toHaveTextContent("xyzzy");
  });
});
