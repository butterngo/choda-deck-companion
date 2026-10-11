// TASK-2384 — sessions waiting on Butter, polled every 30 s: a session that
// just finished should show up while he is still looking at the screen.

import { useQuery } from "@tanstack/react-query";
import { fetchAttention, type AttentionSession } from "../api";

export function useAttention(): { sessions: AttentionSession[]; isError: boolean } {
  const q = useQuery({
    queryKey: ["attention"],
    queryFn: ({ signal }) => fetchAttention(signal),
    refetchInterval: 30_000,
  });
  return { sessions: q.data ?? [], isError: q.isError };
}
