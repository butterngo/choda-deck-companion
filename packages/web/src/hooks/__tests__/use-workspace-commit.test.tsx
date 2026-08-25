// TASK-1783 AC-4 — reopening a commit makes no second request.
//
// This replaces the task's original AC-4, which asserted "the knowledge index
// is fetched exactly once" on the assumption that task→ADR matching could be
// done client-side. It cannot: GET /knowledge?type=decision returns no bodies,
// and 38 of 39 ADRs name their task only in prose. See the task body.
//
// What is measurable, and what the original was reaching for, is that opening
// panels does not do work proportional to how often a reader clicks. A commit
// is immutable, so a second fetch could not return a different answer.
//
// The spy sits on `fetch` rather than on the hook: a spy on the hook would be
// measuring the mock.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useWorkspaceCommit } from "../use-workspace-commit";

const DETAIL = {
  sha: "9dfe9c4".padEnd(40, "0"),
  shortSha: "9dfe9c4",
  authorDate: "2026-08-24T15:29:42+07:00",
  subject: "test(web): something (TASK-1767)",
  taskIds: ["TASK-1767"],
  body: "",
  reachability: "default-branch",
  files: [],
};

let calls: string[] = [];

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }): React.JSX.Element {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function freshClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

beforeEach(() => {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push(String(url));
      return { ok: true, status: 200, json: async () => DETAIL } as unknown as Response;
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useWorkspaceCommit (AC-4)", () => {
  it("fetches once for a commit", async () => {
    const client = freshClient();
    const { result } = renderHook(() => useWorkspaceCommit("ws", DETAIL.sha), {
      wrapper: wrapper(client),
    });
    await waitFor(() => expect(result.current.commit).not.toBeNull());
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain(`/workspaces/ws/commits/${DETAIL.sha}`);
  });

  it("makes NO second request when the same commit is reopened", async () => {
    const client = freshClient();
    const w = wrapper(client);

    const first = renderHook(() => useWorkspaceCommit("ws", DETAIL.sha), { wrapper: w });
    await waitFor(() => expect(first.result.current.commit).not.toBeNull());
    expect(calls).toHaveLength(1);

    // Closing the panel and opening the same commit again.
    first.unmount();
    const second = renderHook(() => useWorkspaceCommit("ws", DETAIL.sha), { wrapper: w });
    await waitFor(() => expect(second.result.current.commit).not.toBeNull());

    // A commit is immutable — a refetch could not return a different answer.
    expect(calls).toHaveLength(1);
  });

  it("CONTROL — a DIFFERENT commit does make its own request", async () => {
    // Without this, the assertion above would pass on a hook that never fetches
    // at all, or one whose query key ignored the sha.
    const client = freshClient();
    const w = wrapper(client);

    const a = renderHook(() => useWorkspaceCommit("ws", DETAIL.sha), { wrapper: w });
    await waitFor(() => expect(a.result.current.commit).not.toBeNull());

    const b = renderHook(() => useWorkspaceCommit("ws", "ad39672".padEnd(40, "0")), { wrapper: w });
    await waitFor(() => expect(b.result.current.commit).not.toBeNull());

    expect(calls).toHaveLength(2);
  });

  it("does not fetch at all until a sha is chosen", () => {
    const client = freshClient();
    renderHook(() => useWorkspaceCommit("ws", null), { wrapper: wrapper(client) });
    expect(calls).toEqual([]);
  });
});
