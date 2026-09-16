// TASK-1966 — the "you are recording" strip.
//
// It is a compliance control first. Recording a client is not lawful everywhere
// without notice, and v1's mitigation is that the person recording can never lose
// track of the fact that they are. So it lives in the shell, above every view,
// and it is unmissable on purpose.
//
// This is also the one place the app uses a rose accent outside an error. The
// house rule reserves rose for failure (see CapabilityNote) so that the eye does
// not learn to ignore it; the recording dot borrows it anyway because "red dot
// means recording" is a convention older than this app, and the whole point here
// is attention. The dot is the ONLY rose element — the strip itself stays zinc.

import { useEffect, useState } from "react";
import { useRecorder } from "../hooks/use-recorder";

function elapsed(since: number, now: number): string {
  const total = Math.max(0, Math.floor((now - since) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function RecordingIndicator(): React.JSX.Element | null {
  const rec = useRecorder();
  const [now, setNow] = useState(() => Date.now());

  const live = rec.status === "recording" || rec.status === "stopping";

  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [live]);

  if (!live || rec.startedAt === null) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="recording-indicator"
      className="flex-none flex items-center gap-2.5 mb-4 px-3 py-2 rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-sm"
    >
      <span className="relative flex h-2.5 w-2.5 flex-none" aria-hidden="true">
        <span className="absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-60 animate-ping" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500" />
      </span>
      <span className="font-medium text-zinc-900 dark:text-zinc-100">
        {rec.status === "stopping" ? "Saving recording" : "Recording meeting"}
      </span>
      <span className="tabular-nums text-zinc-500">{elapsed(rec.startedAt, now)}</span>
      {rec.micMissing && (
        <span className="text-xs text-zinc-500">· microphone unavailable, other side only</span>
      )}
      <button
        type="button"
        onClick={() => void rec.stop()}
        disabled={rec.status === "stopping"}
        className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
      >
        <i className="ti ti-player-stop" aria-hidden="true" />
        Stop
      </button>
    </div>
  );
}
