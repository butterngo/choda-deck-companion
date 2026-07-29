// Task detail over GET /tasks/:id, for the graph node panel. Disabled until a
// task id is known.

import { useQuery } from "@tanstack/react-query";
import { fetchTask, type TaskDetail } from "../api";

export interface TaskDetailView {
  task: TaskDetail | null;
  isLoading: boolean;
  isError: boolean;
}

export function useTask(id: string | null): TaskDetailView {
  const q = useQuery({
    queryKey: ["task", id],
    queryFn: ({ signal }) => fetchTask(id as string, signal),
    enabled: id !== null,
    staleTime: 5_000,
  });
  return {
    task: q.data ?? null,
    isLoading: q.isLoading,
    isError: q.isError,
  };
}
