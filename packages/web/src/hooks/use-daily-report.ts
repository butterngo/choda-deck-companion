// TASK-2675 — GET /daily-report for the Today screen. One request when the screen
// opens, no polling: the git scan behind it is not free, so a refresh is the
// person's choice, not a timer's.
//
// TASK-2705 — the adapter now serves the git half from a cache (choda-deck
// TASK-2704). Opening the screen takes the cached scan; Rescan asks for
// ?fresh=1 and puts that report in place of the cached one.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchDailyReport, type DailyReport } from "../api";

const KEY = ["daily-report"];

export interface DailyReportState {
  report: DailyReport | null;
  isLoading: boolean;
  isError: boolean;
  /** True when the adapter answered with an HTTP error (e.g. an older adapter without the route). */
  answeredWithError: boolean;
  /** Scans git now (?fresh=1) and replaces the report. */
  rescan: () => void;
  isFetching: boolean;
}

export function useDailyReport(): DailyReportState {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: KEY,
    queryFn: ({ signal }) => fetchDailyReport(signal),
  });
  const fresh = useMutation({
    mutationFn: () => fetchDailyReport(undefined, { fresh: true }),
    onSuccess: (report) => qc.setQueryData(KEY, report),
  });
  return {
    report: q.data ?? null,
    isLoading: q.isLoading,
    isError: q.isError,
    answeredWithError: q.isError && /^HTTP \d+/.test(q.error?.message ?? ""),
    rescan: () => fresh.mutate(),
    isFetching: q.isFetching || fresh.isPending,
  };
}
