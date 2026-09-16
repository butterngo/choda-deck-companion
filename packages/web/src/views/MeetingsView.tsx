// TASK-1966 — record a client meeting, and play it back. Rendered as the
// Meeting tab of CaptureView, not as its own page: TASK-1830 forbids new menu.
//
// The recorder itself does not live here: it lives in RecorderProvider above the
// router, so leaving this view mid-meeting does not stop the recording. This view
// only starts it, and lists what has been saved.
//
// The list has more states than "some" and "none", and the ones that look alike
// are the ones that matter (a-companion-view-has-three-states-not-two):
//
//   * loading           — skeleton
//   * route missing     — the adapter answered 404. The shipped app carries a
//                         VENDORED adapter, and a route added after that copy
//                         was taken does not exist until a release vendors it
//                         again. A capability note, not an error, and never
//                         "no recordings": this build cannot store any.
//   * failed            — the API answered and the listing failed
//   * empty             — a stated "none", with the way to make one
//   * recordings        — newest first, two players each

import { useEffect, useState } from "react";
import type { MeetingMeta, MeetingTrack } from "../api";
import { fetchMeetings, meetingAudioUrl, MeetingsRouteMissingError } from "../api";
import { useRecorder } from "../hooks/use-recorder";
import { CapabilityNote } from "../components/state/CapabilityNote";
import { EmptyState } from "../components/state/EmptyState";
import { ErrorState } from "../components/state/ErrorState";
import { Skeleton } from "../components/state/Skeleton";

type ListState =
  | { kind: "loading" }
  | { kind: "route-missing" }
  | { kind: "failed"; message: string }
  | { kind: "ready"; meetings: MeetingMeta[] };

const TRACK_LABEL: Record<MeetingTrack, string> = {
  loopback: "Other side",
  mic: "You",
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function formatDuration(startIso: string, endIso: string): string {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "";
  const mins = Math.round(ms / 60000);
  return mins < 1 ? "under a minute" : mins === 1 ? "1 minute" : `${mins} minutes`;
}

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MeetingsView(): React.JSX.Element {
  const rec = useRecorder();
  const [list, setList] = useState<ListState>({ kind: "loading" });

  // Refetch whenever a recording finalizes — AC-2 wants the new meeting in the
  // list without a manual refresh, and finalizedCount is the signal for exactly
  // that event, including a crash-recovered meeting finalized on launch.
  useEffect(() => {
    const ctrl = new AbortController();
    fetchMeetings(ctrl.signal)
      .then((meetings) => setList({ kind: "ready", meetings }))
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        if (err instanceof MeetingsRouteMissingError) setList({ kind: "route-missing" });
        else setList({ kind: "failed", message: (err as Error).message });
      });
    return () => ctrl.abort();
  }, [rec.finalizedCount]);

  const busy = rec.status !== "idle";

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="flex-none flex items-center gap-3 mb-4">
        <p className="text-sm text-zinc-500">
          The other side and your microphone are recorded as separate tracks.
        </p>
        <button
          type="button"
          onClick={() => void rec.start()}
          disabled={busy || list.kind === "route-missing"}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-700 text-sm text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
        >
          <i className="ti ti-microphone" aria-hidden="true" />
          {rec.status === "starting" ? "Starting…" : busy ? "Recording in progress" : "Record meeting"}
        </button>
      </div>

      {rec.error && (
        <div className="flex-none mb-4">
          <ErrorState variant="failed" subject="Recording" description={rec.error} />
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto">
        {list.kind === "loading" && <Skeleton shape="list" label="Loading recordings…" />}

        {list.kind === "route-missing" && (
          <CapabilityNote icon="ti-plug-off">
            This build's adapter has no meeting storage yet. The installed app carries its own copy
            of the adapter, and this route was added after that copy was taken — it arrives with the
            next release.
          </CapabilityNote>
        )}

        {list.kind === "failed" && (
          <ErrorState variant="failed" subject="Recordings" description={list.message} />
        )}

        {list.kind === "ready" && list.meetings.length === 0 && (
          <EmptyState
            icon="ti-microphone"
            title="No recordings yet"
            description="Start one before a client call. The other side and your microphone are saved as separate tracks."
          />
        )}

        {list.kind === "ready" && list.meetings.length > 0 && (
          <ul className="flex flex-col gap-2" data-testid="meetings-list">
            {list.meetings.map((m) => (
              <li
                key={m.id}
                className="rounded-md border border-zinc-200 dark:border-zinc-800 px-3.5 py-3"
              >
                <div className="flex items-baseline gap-2 mb-2 text-sm">
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">{formatWhen(m.startedAt)}</span>
                  <span className="text-zinc-500">{formatDuration(m.startedAt, m.endedAt)}</span>
                  <span className="ml-auto text-xs tabular-nums text-zinc-400">{formatSize(m.bytes)}</span>
                </div>
                <div className="flex flex-col gap-1.5">
                  {m.tracks.map((track) => (
                    <div key={track} className="flex items-center gap-3">
                      <span className="w-20 flex-none text-xs text-zinc-500">{TRACK_LABEL[track]}</span>
                      <audio
                        controls
                        preload="metadata"
                        src={meetingAudioUrl(m.id, track)}
                        className="h-8 flex-1 min-w-0"
                      />
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
