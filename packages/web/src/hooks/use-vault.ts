// TASK-1576 — vault notes list + one note's markdown on demand. Same shape and
// cadence as use-knowledge, over the same single laptop API.
//
// Notes are files on disk that Butter also edits by hand, so they change without
// the app knowing. Polling the list on the shared cadence keeps a newly captured
// note showing up without a refresh.

import { useQuery } from "@tanstack/react-query";
import { fetchVaultNote, fetchVaultNotes, type VaultNoteSummary } from "../api";
import { HEALTH_POLL_MS } from "./use-health";

export interface VaultListView {
  notes: VaultNoteSummary[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useVaultNotes(): VaultListView {
  const q = useQuery({
    queryKey: ["vault", "notes"],
    queryFn: ({ signal }) => fetchVaultNotes(signal),
    refetchInterval: HEALTH_POLL_MS,
    staleTime: 0,
  });
  return {
    notes: q.data ?? [],
    isLoading: q.isLoading,
    isError: q.isError,
    refetch: () => void q.refetch(),
  };
}

export interface VaultNoteView {
  markdown: string | null;
  isLoading: boolean;
  isError: boolean;
}

export function useVaultNote(slug: string | null): VaultNoteView {
  const q = useQuery({
    queryKey: ["vault", "note", slug],
    queryFn: ({ signal }) => fetchVaultNote(slug as string, signal),
    enabled: slug !== null,
    staleTime: 0,
  });
  return {
    markdown: q.data ?? null,
    isLoading: q.isLoading,
    isError: q.isError,
  };
}
