// TASK-1831 — the text of one configured file.
//
// This hook exists because the route it calls had no caller. GET
// /claude-config/<rootId>/<rel> shipped with five acceptance criteria and
// twenty-one tests and was never requested by anything — the "shipped but
// unreachable" defect this epic was created to close, committed inside the
// epic itself.

import { useQuery } from "@tanstack/react-query";
import { fetchClaudeConfigFile, type ClaudeRef } from "../api";

export interface ClaudeConfigFileView {
  text: string | null;
  isLoading: boolean;
  isError: boolean;
}

export function useClaudeConfigFile(ref: ClaudeRef | null): ClaudeConfigFileView {
  const q = useQuery({
    queryKey: ["claude-config-file", ref?.rootId ?? null, ref?.rel ?? null],
    queryFn: ({ signal }) => fetchClaudeConfigFile(ref as ClaudeRef, signal),
    enabled: ref !== null,
    // Unlike the inventory, a file is only re-read when the reader asks for it
    // again. Polling every open file would re-download a 50KB SKILL.md on a
    // timer for no one's benefit.
    staleTime: 30_000,
    retry: false,
  });

  return {
    text: q.data ?? null,
    isLoading: ref !== null && q.isLoading,
    isError: q.isError,
  };
}
