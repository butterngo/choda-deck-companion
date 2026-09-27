// TASK-2153 — GET /activity/digests for the Activity view. One request, no
// polling: a digest is written once a day, so refetching on an interval would
// only ever return the same files.

import { useQuery } from "@tanstack/react-query";
import { fetchActivityDigests, type ActivityDigest } from "../api";

export interface ActivityState {
  digests: ActivityDigest[];
  isLoading: boolean;
  isError: boolean;
}

export function useActivity(): ActivityState {
  const q = useQuery({
    queryKey: ["activity-digests"],
    queryFn: ({ signal }) => fetchActivityDigests(signal),
  });
  return { digests: q.data ?? [], isLoading: q.isLoading, isError: q.isError };
}
