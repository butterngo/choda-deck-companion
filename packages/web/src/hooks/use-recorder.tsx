// TASK-1966 — the meeting recorder, and why it is a provider rather than a hook
// inside the Meetings view.
//
// A MediaRecorder owned by a view component is destroyed when that component
// unmounts, and navigating to any other view unmounts it. The recording would
// stop the moment someone glanced at a task mid-meeting. So the recorder lives
// ABOVE the router outlet (Shell mounts this provider once) and every view reads
// the same instance. This is also what lets the indicator stay on screen in every
// view, which AC-1 requires and which is a compliance control, not decoration.
//
// Two tracks, two recorders, two files. Loopback is what the machine PLAYS — the
// other participants — granted by electron/display-media.cjs (TASK-1964). The mic
// is a separate getUserMedia stream. They are never mixed: separate files give the
// transcription phase "me" versus "them" without diarization.
//
// Chunks go up as they are produced, one POST per timeslice, so a crash costs at
// most TIMESLICE_MS of audio. The adapter (choda-deck TASK-1965) refuses any seq
// but `last + 1` with 409, so each track has its own strictly serial upload chain.
//
// CRASH RECOVERY, and the contract tension it resolves. The adapter treats a
// meeting directory without meta.json as still being recorded and makes it
// INVISIBLE to listing and eviction — deliberately, so retention can never delete
// a live recording. But a meeting cut short by a killed app is never finalized, so
// it would stay invisible forever. The active meeting id is therefore kept in
// localStorage while recording; on the next mount, a leftover id means the last
// session died, and it is finalized then, with the time of its last accepted
// chunk as its end. That surfaces it in the list without changing the adapter's
// rule. Only the most recent orphan is recovered — two crashes without reopening
// the app in between leaves the older one invisible, which is a known limit.

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { MeetingTrack } from "../api";
import { finalizeMeeting, postMeetingChunk } from "../api";

/** One chunk per 10 s: a crash loses at most this much audio. */
export const TIMESLICE_MS = 10_000;

const MIME = "audio/webm;codecs=opus";
const ORPHAN_KEY = "choda.recorder.active";

export type RecorderStatus = "idle" | "starting" | "recording" | "stopping";

export interface RecorderState {
  status: RecorderStatus;
  meetingId: string | null;
  /** Epoch ms the recording began. Null when idle. */
  startedAt: number | null;
  /** Last failure — shown to the user, never swallowed. Cleared on the next start. */
  error: string | null;
  /** Recording continues on loopback alone when the microphone is refused. */
  micMissing: boolean;
  /** Increments on every finalize, so the list can refetch without polling. */
  finalizedCount: number;
}

export interface Recorder extends RecorderState {
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

interface Orphan {
  id: string;
  startedAt: string;
  lastChunkAt: string;
}

function readOrphan(): Orphan | null {
  try {
    const raw = localStorage.getItem(ORPHAN_KEY);
    return raw ? (JSON.parse(raw) as Orphan) : null;
  } catch {
    return null;
  }
}

function writeOrphan(o: Orphan | null): void {
  try {
    if (o) localStorage.setItem(ORPHAN_KEY, JSON.stringify(o));
    else localStorage.removeItem(ORPHAN_KEY);
  } catch {
    // Storage blocked. Recording still works; only crash recovery is lost.
  }
}

/** Matches the adapter's /^[A-Za-z0-9_-]{1,64}$/ meeting-id rule. */
function newMeetingId(): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `m-${Date.now().toString(36)}-${rand}`;
}

const IDLE: RecorderState = {
  status: "idle",
  meetingId: null,
  startedAt: null,
  error: null,
  micMissing: false,
  finalizedCount: 0,
};

const RecorderContext = createContext<Recorder | null>(null);

interface TrackRun {
  track: MeetingTrack;
  recorder: MediaRecorder;
  stream: MediaStream;
  seq: number;
  chain: Promise<void>;
  stopped: Promise<void>;
}

export function RecorderProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [state, setState] = useState<RecorderState>(IDLE);
  const runs = useRef<TrackRun[]>([]);
  const displayStream = useRef<MediaStream | null>(null);
  const meta = useRef<{ id: string; startedAtIso: string } | null>(null);

  const fail = useCallback((message: string) => {
    setState((s) => ({ ...s, error: message }));
  }, []);

  // Crash recovery — see the header. Runs once, when the shell mounts.
  useEffect(() => {
    const orphan = readOrphan();
    if (!orphan) return;
    finalizeMeeting(orphan.id, { startedAt: orphan.startedAt, endedAt: orphan.lastChunkAt })
      .then(() => setState((s) => ({ ...s, finalizedCount: s.finalizedCount + 1 })))
      .catch(() => {
        // 404 means no chunk ever landed, so there is nothing to recover. Any
        // other failure is left for the next launch rather than looping here.
      })
      .finally(() => writeOrphan(null));
  }, []);

  const startTrack = useCallback(
    (track: MeetingTrack, stream: MediaStream, id: string): TrackRun => {
      const recorder = new MediaRecorder(stream, { mimeType: MIME });
      const run: TrackRun = {
        track,
        recorder,
        stream,
        seq: 0,
        chain: Promise.resolve(),
        stopped: new Promise((resolve) => recorder.addEventListener("stop", () => resolve())),
      };
      recorder.addEventListener("dataavailable", (e: BlobEvent) => {
        if (e.data.size === 0) return;
        const seq = run.seq++;
        // Serial per track. A parallel POST could land seq 3 before seq 2, and
        // the adapter would rightly refuse it.
        run.chain = run.chain.then(async () => {
          try {
            await postMeetingChunk(id, track, seq, e.data);
            const current = readOrphan();
            if (current?.id === id) {
              writeOrphan({ ...current, lastChunkAt: new Date().toISOString() });
            }
          } catch (err) {
            fail(`Upload of ${track} chunk ${seq} failed: ${(err as Error).message}`);
          }
        });
      });
      recorder.start(TIMESLICE_MS);
      return run;
    },
    [fail],
  );

  const start = useCallback(async () => {
    if (state.status !== "idle") return;
    setState((s) => ({ ...s, status: "starting", error: null, micMissing: false }));

    let display: MediaStream;
    try {
      display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    } catch (err) {
      setState((s) => ({ ...s, status: "idle", error: `Could not capture system audio: ${(err as Error).message}` }));
      return;
    }

    // The screen video is not wanted — only the loopback audio is. Stopping the
    // video track does not end the audio track; they are independent.
    display.getVideoTracks().forEach((t) => t.stop());

    const loopbackTracks = display.getAudioTracks();
    if (loopbackTracks.length === 0) {
      // The silent-capture case TASK-1964 warned about. Refusing to record is
      // better than recording an hour of nothing and finding out afterwards.
      setState((s) => ({
        ...s,
        status: "idle",
        error: "No system audio was granted, so the other side of the call would not be recorded.",
      }));
      return;
    }

    let mic: MediaStream | null = null;
    try {
      mic = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      mic = null;
    }

    const id = newMeetingId();
    const startedAtIso = new Date().toISOString();
    meta.current = { id, startedAtIso };
    displayStream.current = display;
    writeOrphan({ id, startedAt: startedAtIso, lastChunkAt: startedAtIso });

    const next: TrackRun[] = [startTrack("loopback", new MediaStream(loopbackTracks), id)];
    if (mic) next.push(startTrack("mic", mic, id));
    runs.current = next;

    setState((s) => ({
      ...s,
      status: "recording",
      meetingId: id,
      startedAt: Date.now(),
      micMissing: mic === null,
    }));
  }, [state.status, startTrack]);

  const stop = useCallback(async () => {
    if (state.status !== "recording" || !meta.current) return;
    setState((s) => ({ ...s, status: "stopping" }));

    const { id, startedAtIso } = meta.current;
    const active = runs.current;

    // Stopping flushes one last dataavailable; wait for that, THEN for every
    // queued upload, and only then finalize. Finalizing first would write a
    // meta.json whose byte count misses the tail of the meeting.
    active.forEach((r) => r.recorder.state !== "inactive" && r.recorder.stop());
    await Promise.all(active.map((r) => r.stopped));
    await Promise.all(active.map((r) => r.chain));

    active.forEach((r) => r.stream.getTracks().forEach((t) => t.stop()));
    displayStream.current?.getTracks().forEach((t) => t.stop());

    try {
      await finalizeMeeting(id, { startedAt: startedAtIso, endedAt: new Date().toISOString() });
      writeOrphan(null);
      setState((s) => ({
        ...s,
        status: "idle",
        meetingId: null,
        startedAt: null,
        finalizedCount: s.finalizedCount + 1,
      }));
    } catch (err) {
      // Leave the orphan in place: the chunks are safe on disk, and the next
      // launch will try to finalize it again.
      setState((s) => ({
        ...s,
        status: "idle",
        meetingId: null,
        startedAt: null,
        error: `Recording saved, but it could not be finalized: ${(err as Error).message}. It will be retried on the next launch.`,
      }));
    } finally {
      runs.current = [];
      meta.current = null;
      displayStream.current = null;
    }
  }, [state.status]);

  return (
    <RecorderContext.Provider value={{ ...state, start, stop }}>{children}</RecorderContext.Provider>
  );
}

export function useRecorder(): Recorder {
  const ctx = useContext(RecorderContext);
  if (!ctx) throw new Error("useRecorder must be used inside RecorderProvider (mounted by Shell)");
  return ctx;
}
