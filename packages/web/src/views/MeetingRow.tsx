// TASK-1993 — one recorded meeting: its two players, its transcript, and the
// Transcribe action that produces one.
//
// Transcription is manual by decision (TASK-1989): nothing is sent to Azure when
// a recording stops, and nothing is sent when this row mounts. Client audio
// leaves the laptop only when someone presses the button.
//
// A ▶ timestamp seeks BOTH players. The two tracks are separate files
// (TASK-1966), and a seek that moved only one would play the other side of the
// conversation from the wrong moment — exactly the evidence the note exists to
// give. TASK-1994's note links reuse this seek rather than building a second one.
//
// What a failed transcription looks like is kept apart from what "not yet"
// looks like (a-companion-view-has-three-states-not-two):
//
//   * not transcribed   — a stated "no transcript yet", with the button
//   * unconfigured (501)— capability note: no Speech key, nothing broken
//   * route missing(404)— capability note: this adapter predates the route
//   * failed (502 …)    — error, with a retry; the recording is untouched

import { useEffect, useRef, useState } from "react";
import type { MeetingMeta, MeetingTrack, TranscriptSegment } from "../api";
import { fetchTranscript, meetingAudioUrl, transcribeMeeting, TranscribeError } from "../api";
import { CapabilityNote } from "../components/state/CapabilityNote";
import { ErrorState } from "../components/state/ErrorState";

const TRACK_LABEL: Record<MeetingTrack, string> = {
  loopback: "Other side",
  mic: "You",
};

type TranscriptState =
  | { kind: "none" }
  | { kind: "loading" }
  | { kind: "transcribing" }
  | { kind: "unconfigured" }
  | { kind: "route-missing" }
  | { kind: "failed"; message: string }
  | { kind: "ready"; segments: TranscriptSegment[] };

/** `mm:ss`, or `h:mm:ss` from one hour on — the same format the note renders. */
export function formatAt(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number): string => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

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

export function MeetingRow({ meeting }: { meeting: MeetingMeta }): React.JSX.Element {
  const players = useRef<Partial<Record<MeetingTrack, HTMLAudioElement | null>>>({});
  const [transcript, setTranscript] = useState<TranscriptState>(
    meeting.transcribedAt ? { kind: "loading" } : { kind: "none" },
  );

  // An existing transcript is READ, never re-created: reading it costs nothing
  // and sends nothing to Azure.
  useEffect(() => {
    if (!meeting.transcribedAt) return;
    const ctrl = new AbortController();
    fetchTranscript(meeting.id, ctrl.signal)
      .then((t) => setTranscript({ kind: "ready", segments: t.segments }))
      .catch((err: unknown) => {
        if (!ctrl.signal.aborted) setTranscript({ kind: "failed", message: (err as Error).message });
      });
    return () => ctrl.abort();
  }, [meeting.id, meeting.transcribedAt]);

  async function transcribe(): Promise<void> {
    setTranscript({ kind: "transcribing" });
    try {
      const t = await transcribeMeeting(meeting.id);
      setTranscript({ kind: "ready", segments: t.segments });
    } catch (err) {
      if (err instanceof TranscribeError && err.kind !== "failed") setTranscript({ kind: err.kind });
      else setTranscript({ kind: "failed", message: (err as Error).message });
    }
  }

  function seek(ms: number): void {
    for (const track of meeting.tracks) {
      const el = players.current[track];
      if (!el) continue;
      el.currentTime = ms / 1000;
      // play() rejects when the browser blocks autoplay; the seek still stands.
      void Promise.resolve(el.play?.()).catch(() => {});
    }
  }

  const transcribed = transcript.kind === "ready";
  const canTranscribe = transcript.kind === "none" || transcript.kind === "failed";

  return (
    <li className="rounded-md border border-zinc-200 dark:border-zinc-800 px-3.5 py-3" data-testid={`meeting-${meeting.id}`}>
      <div className="flex items-baseline gap-2 mb-2 text-sm">
        <span className="font-medium text-zinc-900 dark:text-zinc-100">{formatWhen(meeting.startedAt)}</span>
        <span className="text-zinc-500">{formatDuration(meeting.startedAt, meeting.endedAt)}</span>
        <span
          className="text-xs text-zinc-500 rounded bg-zinc-100 dark:bg-zinc-800 px-1.5"
          data-testid="meeting-status"
        >
          {transcribed ? "Transcribed" : "Recorded"}
        </span>
        <span className="ml-auto text-xs tabular-nums text-zinc-400">{formatSize(meeting.bytes)}</span>
      </div>

      <div className="flex flex-col gap-1.5">
        {meeting.tracks.map((track) => (
          <div key={track} className="flex items-center gap-3">
            <span className="w-20 flex-none text-xs text-zinc-500">{TRACK_LABEL[track]}</span>
            <audio
              ref={(el) => {
                players.current[track] = el;
              }}
              data-track={track}
              controls
              preload="metadata"
              src={meetingAudioUrl(meeting.id, track)}
              className="h-8 flex-1 min-w-0"
            />
          </div>
        ))}
      </div>

      <div className="mt-3">
        {transcript.kind === "none" && (
          <p className="text-xs text-zinc-500" data-testid="transcript-none">
            No transcript yet.
          </p>
        )}
        {transcript.kind === "loading" && <p className="text-xs text-zinc-500">Loading transcript…</p>}
        {transcript.kind === "transcribing" && (
          <p className="text-xs text-zinc-500">Transcribing — about a minute per 25 minutes of audio…</p>
        )}
        {transcript.kind === "unconfigured" && (
          <CapabilityNote icon="ti-key-off">
            Speech is not configured on this adapter, so it cannot transcribe. Add an Azure Speech key to
            azure-speech.txt; the recording is unaffected.
          </CapabilityNote>
        )}
        {transcript.kind === "route-missing" && (
          <CapabilityNote icon="ti-plug-off">
            This build's adapter cannot transcribe yet. The installed app carries its own copy of the adapter,
            and transcription was added after that copy was taken — it arrives with the next release.
          </CapabilityNote>
        )}
        {transcript.kind === "failed" && (
          <ErrorState variant="failed" subject="Transcription" description={transcript.message} />
        )}

        {canTranscribe && (
          <button
            type="button"
            onClick={() => void transcribe()}
            className="mt-2 flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <i className="ti ti-file-text" aria-hidden="true" />
            {transcript.kind === "failed" ? "Retry transcription" : "Transcribe"}
          </button>
        )}

        {transcript.kind === "ready" && (
          <ol className="mt-1 max-h-80 overflow-y-auto flex flex-col gap-1 text-sm" data-testid="transcript">
            {transcript.segments.map((s, i) => (
              <li key={`${s.track}-${s.startMs}-${i}`} className="flex gap-2">
                <button
                  type="button"
                  onClick={() => seek(s.startMs)}
                  className="flex-none text-xs tabular-nums text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                  aria-label={`Play from ${formatAt(s.startMs)}`}
                >
                  ▶ {formatAt(s.startMs)}
                </button>
                <span className="flex-none w-10 text-xs text-zinc-500">{s.speaker}</span>
                <span className="text-zinc-800 dark:text-zinc-200">{s.text}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </li>
  );
}
