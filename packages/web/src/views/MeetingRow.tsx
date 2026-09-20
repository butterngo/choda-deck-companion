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
import {
  deleteMeetingAudio,
  fetchTranscript,
  meetingAudioUrl,
  renameMeeting,
  deleteMeeting,
  transcribeMeeting,
  MEETING_TITLE_MAX_CHARS,
  MeetingsRouteMissingError,
  TranscribeError,
} from "../api";
import { CapabilityNote } from "../components/state/CapabilityNote";
import { MeetingSave } from "./MeetingSave";
import { FullscreenOverlay } from "../components/FullscreenOverlay";
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

/**
 * TASK-2045 — the transcript, rendered identically in the row's own pane and in
 * the fullscreen overlay.
 *
 * `seek` is passed in rather than rebuilt so BOTH copies drive the same <audio>
 * elements: those live in the row body, which the overlay does not unmount, and
 * a ▶ inside the overlay has to move the very same playback the row is doing.
 */
export function TranscriptList({
  segments,
  audioGone,
  seek,
  className,
  testId,
}: {
  segments: TranscriptSegment[];
  audioGone: boolean;
  seek: (ms: number) => void;
  className?: string;
  testId?: string;
}): React.JSX.Element {
  return (
    <ol
      className={`flex flex-col gap-1 text-sm ${className ?? ""}`}
      data-testid={testId ?? "transcript"}
    >
      {segments.map((s, i) => (
        <li key={`${s.track}-${s.startMs}-${i}`} className="flex gap-2">
          {/* With the audio gone there is nothing to seek, so the control
              is absent rather than present and dead. */}
          {audioGone ? (
            <span className="flex-none text-xs tabular-nums text-zinc-400">{formatAt(s.startMs)}</span>
          ) : (
            <button
              type="button"
              onClick={() => seek(s.startMs)}
              className="flex-none text-xs tabular-nums text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
              aria-label={`Play from ${formatAt(s.startMs)}`}
            >
              ▶ {formatAt(s.startMs)}
            </button>
          )}
          <span className="flex-none w-10 text-xs text-zinc-500">{s.speaker}</span>
          <span className="text-zinc-800 dark:text-zinc-200">{s.text}</span>
        </li>
      ))}
    </ol>
  );
}

export function MeetingRow({
  meeting,
  onRenamed,
  onDeleted,
}: {
  meeting: MeetingMeta;
  /** TASK-2043 — lift the new title so the list keeps it across a re-render. */
  onRenamed?: (id: string, title: string | null) => void;
  /** TASK-2044 — the row cannot remove itself from a list it does not own. */
  onDeleted?: (id: string) => void;
}): React.JSX.Element {
  const players = useRef<Partial<Record<MeetingTrack, HTMLAudioElement | null>>>({});
  // TASK-2005 — a row is one line until it is opened.
  //
  // `everOpened` is separate from `open` on purpose. Once a row has been opened
  // its body stays MOUNTED and is merely hidden, because the body holds the note
  // draft: an edited draft is minutes of the user's reading and correcting, and
  // unmounting it on collapse would throw that away silently and re-charge a
  // model call to get a worse version back. A row that was never opened mounts
  // nothing at all, which is the whole point of the change.
  const [open, setOpen] = useState(false);
  const [everOpened, setEverOpened] = useState(false);
  // TASK-2003 — a recording is the largest thing this app writes (49 MB for 25
  // minutes). Its audio can be dropped to reclaim that while the transcript,
  // which is the part worth keeping, stays. Irreversible, so it asks first —
  // and the question names both halves, because "delete" on its own reads as
  // deleting the meeting.
  const [audioGone, setAudioGone] = useState(Boolean(meeting.audioDeletedAt));
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // TASK-2043 — the generated title is a guess made from the opening minutes of
  // a transcript. The person who sat in the meeting outranks it, so the row is
  // renameable in place. `renameGone` is the stale-adapter case: the shipped app
  // vendors the adapter, so PATCH may simply not be there yet, and that must
  // read as "rename unavailable" rather than as a broken row.
  const [title, setTitle] = useState<string | null>(meeting.title ?? null);
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renameGone, setRenameGone] = useState(false);
  // TASK-2044 — the row's own removal. Separate from `confirming`/`deleting`
  // above, which belong to "drop the audio, keep the meeting": the two are one
  // path segment apart in the adapter and opposite in consequence, and sharing
  // state between them would let one confirmation arm the other.
  // TASK-2045 — the transcript pane, full window.
  const [transcriptFull, setTranscriptFull] = useState(false);
  const [purgeConfirming, setPurgeConfirming] = useState(false);
  const [purging, setPurging] = useState(false);
  const [purgeError, setPurgeError] = useState<string | null>(null);
  const [purgeGone, setPurgeGone] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptState>(
    meeting.transcribedAt ? { kind: "loading" } : { kind: "none" },
  );

  // An existing transcript is READ, never re-created: reading it costs nothing
  // and sends nothing to Azure.
  // Gated on the row being opened: a list of a dozen transcribed meetings used
  // to fire a dozen transcript reads nobody asked to see.
  useEffect(() => {
    if (!meeting.transcribedAt || !everOpened) return;
    const ctrl = new AbortController();
    fetchTranscript(meeting.id, ctrl.signal)
      .then((t) => setTranscript({ kind: "ready", segments: t.segments }))
      .catch((err: unknown) => {
        if (!ctrl.signal.aborted) setTranscript({ kind: "failed", message: (err as Error).message });
      });
    return () => ctrl.abort();
  }, [meeting.id, meeting.transcribedAt, everOpened]);

  function toggle(): void {
    setOpen((was) => {
      // Collapsing must silence the row: a hidden player that keeps playing is
      // a voice with no visible source anywhere on the page.
      if (was) for (const el of Object.values(players.current)) el?.pause?.();
      else setEverOpened(true);
      return !was;
    });
  }

  async function removeAudio(): Promise<void> {
    setDeleteError(null);
    setDeleting(true);
    try {
      await deleteMeetingAudio(meeting.id);
      setAudioGone(true);
      setConfirming(false);
    } catch (err) {
      setDeleteError((err as Error).message);
    } finally {
      setDeleting(false);
    }
  }

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

  async function saveRename(): Promise<void> {
    const next = renameDraft.trim();
    // An unchanged value is not a save: it would spend a request and a write to
    // reach the state the row is already in.
    if (next === (title ?? "")) {
      setRenaming(false);
      return;
    }
    setRenameSaving(true);
    setRenameError(null);
    try {
      // Empty means "clear it" — the row goes back to being named by its
      // timestamp, which is a state the adapter models explicitly as null.
      const saved = await renameMeeting(meeting.id, next.length === 0 ? null : next);
      setTitle(saved);
      onRenamed?.(meeting.id, saved);
      setRenaming(false);
    } catch (err) {
      if (err instanceof MeetingsRouteMissingError) {
        setRenameGone(true);
        setRenaming(false);
      } else {
        setRenameError(err instanceof Error ? err.message : "rename failed");
      }
    } finally {
      setRenameSaving(false);
    }
  }

  async function purge(): Promise<void> {
    setPurging(true);
    setPurgeError(null);
    try {
      await deleteMeeting(meeting.id);
      // The row is removed by the list, not by itself: this component is about
      // to be unmounted, and setting state on it here would be setting state on
      // something that no longer exists.
      onDeleted?.(meeting.id);
    } catch (err) {
      if (err instanceof MeetingsRouteMissingError) {
        setPurgeGone(true);
        setPurgeConfirming(false);
      } else {
        setPurgeError(err instanceof Error ? err.message : "delete failed");
      }
      setPurging(false);
    }
  }

  function startRename(): void {
    setRenameDraft(title ?? "");
    setRenameError(null);
    setRenaming(true);
  }

  const canTranscribe = transcript.kind === "none" || transcript.kind === "failed";

  return (
    <li className="rounded-md border border-zinc-200 dark:border-zinc-800 px-3.5 py-3" data-testid={`meeting-${meeting.id}`}>
      {/* The toggle is a button spanning the whole header, so the rename control
          has to be its SIBLING — nesting a button inside a button is invalid and
          swallows the inner click. */}
      <div className="flex items-baseline gap-2">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="w-full flex items-baseline gap-2 text-sm text-left"
      >
        <i
          className={`ti ${open ? "ti-chevron-down" : "ti-chevron-right"} self-center text-zinc-400`}
          aria-hidden="true"
        />
        {/* TASK-2043 — the title leads when there is one, and the timestamp drops
            to secondary text rather than disappearing: it is what distinguishes
            two meetings the model named the same thing. With no title the
            timestamp leads exactly as it always did. */}
        {title ? (
          <>
            <span className="font-medium text-zinc-900 dark:text-zinc-100" data-testid="meeting-title">
              {title}
            </span>
            <span className="text-xs text-zinc-500" data-testid="meeting-when">
              {formatWhen(meeting.startedAt)}
            </span>
          </>
        ) : (
          <span className="font-medium text-zinc-900 dark:text-zinc-100" data-testid="meeting-when">
            {formatWhen(meeting.startedAt)}
          </span>
        )}
        <span className="text-zinc-500">{formatDuration(meeting.startedAt, meeting.endedAt)}</span>
        {/* Read from the meeting, not from the loaded transcript: a collapsed row
            has loaded nothing, and must still be triageable from the list. */}
        <span
          className="text-xs text-zinc-500 rounded bg-zinc-100 dark:bg-zinc-800 px-1.5"
          data-testid="meeting-status"
        >
          {meeting.transcribedAt ? "Transcribed" : "Recorded"}
        </span>
        <span className="ml-auto text-xs tabular-nums text-zinc-400">{formatSize(meeting.bytes)}</span>
      </button>
      {!purgeGone && !renaming && !purgeConfirming && (
        <button
          type="button"
          onClick={() => {
            setPurgeError(null);
            setPurgeConfirming(true);
          }}
          aria-label={title ? `Delete ${title}` : "Delete this recording"}
          className="text-zinc-400 hover:text-red-600 dark:hover:text-red-400"
          data-testid="purge-start"
        >
          <i className="ti ti-trash text-sm" aria-hidden="true" />
        </button>
      )}
      {!renameGone && !renaming && (
        <button
          type="button"
          onClick={startRename}
          aria-label={title ? `Rename ${title}` : "Name this meeting"}
          className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
          data-testid="rename-start"
        >
          <i className="ti ti-pencil text-sm" aria-hidden="true" />
        </button>
      )}
      </div>

      {renaming && (
        <div className="mt-2 flex items-center gap-2" data-testid="rename-editor">
          <input
            aria-label="Meeting title"
            value={renameDraft}
            autoFocus
            maxLength={MEETING_TITLE_MAX_CHARS}
            onChange={(e) => setRenameDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void saveRename();
              if (e.key === "Escape") setRenaming(false);
            }}
            placeholder={formatWhen(meeting.startedAt)}
            className="flex-1 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1 text-sm"
          />
          <button
            type="button"
            onClick={() => void saveRename()}
            disabled={renameSaving}
            className="text-xs text-zinc-600 dark:text-zinc-300 hover:underline disabled:opacity-50"
          >
            {renameSaving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => setRenaming(false)}
            className="text-xs text-zinc-500 hover:underline"
          >
            Cancel
          </button>
        </div>
      )}
      {renameError && (
        <p className="mt-1 text-xs text-red-600 dark:text-red-400" data-testid="rename-error">
          {renameError}
        </p>
      )}
      {purgeConfirming && (
        <div className="mt-2 flex items-center gap-2 text-xs" data-testid="purge-confirm">
          {/* The question names what goes, because "delete" on its own reads as
              the audio-only delete that sits a few lines below inside the body. */}
          <span className="text-zinc-600 dark:text-zinc-300">
            Delete this recording, its transcript and its note? This cannot be undone.
          </span>
          <button
            type="button"
            onClick={() => void purge()}
            disabled={purging}
            className="text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
            data-testid="purge-confirmed"
          >
            {purging ? "Deleting…" : "Delete"}
          </button>
          <button
            type="button"
            onClick={() => setPurgeConfirming(false)}
            className="text-zinc-500 hover:underline"
          >
            Cancel
          </button>
        </div>
      )}
      {purgeError && (
        <p className="mt-1 text-xs text-red-600 dark:text-red-400" data-testid="purge-error">
          {purgeError}
        </p>
      )}
      {purgeGone && (
        <p className="mt-1 text-xs text-zinc-500" data-testid="purge-unavailable">
          Deleting a whole recording needs a newer adapter than this build carries. You can
          still delete its audio from inside the row.
        </p>
      )}
      {renameGone && (
        <p className="mt-1 text-xs text-zinc-500" data-testid="rename-unavailable">
          Rename needs a newer adapter than this build carries. Everything else on this
          recording still works.
        </p>
      )}

      {everOpened && (
      <div hidden={!open} data-testid="meeting-body">
      {audioGone ? (
        <p className="mt-2 text-xs text-zinc-500" data-testid="audio-deleted">
          Audio deleted to free space. The transcript below is unaffected.
        </p>
      ) : (
      <div className="flex flex-col gap-1.5 mt-2">
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
      )}

      {!audioGone && (
        <div className="mt-2">
          {confirming ? (
            <span className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300" data-testid="delete-confirm">
              Delete this meeting&apos;s audio? The transcript is kept; the recording cannot be recovered.
              <button
                type="button"
                disabled={deleting}
                onClick={() => void removeAudio()}
                className="px-2 py-0.5 rounded-md border border-zinc-300 dark:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Delete audio"}
              </button>
              <button type="button" onClick={() => setConfirming(false)} className="text-zinc-400 hover:text-zinc-700">
                Keep
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
            >
              <i className="ti ti-trash" aria-hidden="true" />
              Delete audio, keep transcript
            </button>
          )}
        </div>
      )}
      {deleteError && <ErrorState variant="failed" subject="Deleting audio" description={deleteError} />}

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
          <>
          <button
            type="button"
            onClick={() => setTranscriptFull(true)}
            className="mt-1 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
            data-testid="transcript-fullscreen"
          >
            <i className="ti ti-arrows-maximize mr-1" aria-hidden="true" />
            Read full screen
          </button>
          <TranscriptList
            segments={transcript.segments}
            audioGone={audioGone}
            seek={seek}
            className="mt-1 max-h-80 overflow-y-auto"
          />
          {transcriptFull && (
            <FullscreenOverlay
              title={title ?? formatWhen(meeting.startedAt)}
              onClose={() => setTranscriptFull(false)}
              testId="transcript-overlay"
            >
              {/* Same seek, same players. The row below is still mounted and
                  still playing; this is a second view of it, not a copy. */}
              <TranscriptList
                segments={transcript.segments}
                audioGone={audioGone}
                seek={seek}
                testId="transcript-full"
              />
            </FullscreenOverlay>
          )}
          </>
        )}

        {transcript.kind === "ready" && (
          <MeetingSave
            meeting={meeting}
            segments={transcript.segments}
            currentMs={() => {
              const el = players.current.loopback ?? players.current.mic;
              return (el?.currentTime ?? 0) * 1000;
            }}
          />
        )}
      </div>
      </div>
      )}
    </li>
  );
}
