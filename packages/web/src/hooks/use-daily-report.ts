// TASK-2675 — GET /daily-report for the Today screen. One request when the screen
// opens, no polling: the adapter computes it live on every call, and the git scan
// behind it is not free, so a refresh is the person's choice, not a timer's.

import { useQuery } from "@tanstack/react-query";
import { fetchDailyReport, type DailyReport } from "../api";

export interface DailyReportState {
  report: DailyReport | null;
  isLoading: boolean;
  isError: boolean;
  /** True when the adapter answered with an HTTP error (e.g. an older adapter without the route). */
  answeredWithError: boolean;
  refetch: () => void;
  isFetching: boolean;
}

export function useDailyReport(): DailyReportState {
  const q = useQuery({
    queryKey: ["daily-report"],
    queryFn: ({ signal }) => fetchDailyReport(signal),
  });
  return {
    report: q.data ?? null,
    isLoading: q.isLoading,
    isError: q.isError,
    answeredWithError: q.isError && /^HTTP \d+/.test(q.error?.message ?? ""),
    refetch: () => void q.refetch(),
    isFetching: q.isFetching,
  };
}
