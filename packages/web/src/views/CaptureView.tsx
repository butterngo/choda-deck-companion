// TASK-1494 — the Capture pillar: screenshot the screen (Electron-granted) or
// share an existing image, then Save/Copy it. Self-contained — no laptop API
// call, so it works even when the adapter is down (unlike the other pillars).
//
// TASK-1966 — and record a meeting. It lives here as a second tab rather than as
// its own sidebar entry because of TASK-1830's standing rule: no new menu. The
// Capture action already exists in the Shell foot, and recording a meeting is a
// capture, so it joins this page instead of adding a destination. The tab is kept
// in the URL (`?mode=meeting`) so it deep-links and survives a refresh.

import { useEffect, useState } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import {
  captureScreenshotDataUrl,
  captureFilename,
  readImageFileAsDataUrl,
  imageFileFromClipboard,
} from "../lib/capture";
import { CapturePreview } from "../components/CapturePreview";
import { CaptureSendPanel } from "../components/CaptureSendPanel";
import { CaptureRegion } from "../components/CaptureRegion";
import type { HealthView } from "../hooks/use-health";
import { useWorkspace } from "../hooks/use-workspace";
import { useWorkspaces } from "../hooks/use-workspaces";
import { EmptyState } from "../components/state/EmptyState";
import { MeetingsView } from "./MeetingsView";

// idle → (screen capture) region → preview ; file share jumps straight to preview.
type Stage = "idle" | "region" | "preview";

function ScreenshotCapture(): React.JSX.Element {
  const health = useOutletContext<HealthView>();
  const { workspaceId } = useWorkspace();
  const { workspaces } = useWorkspaces();
  // TASK-1498 — the conversation is opened under the selected workspace's
  // project; null until one is chosen, which disables Send (AC-4).
  const projectId = workspaces.find((w) => w.id === workspaceId)?.projectId ?? null;

  const [stage, setStage] = useState<Stage>("idle");
  const [raw, setRaw] = useState<string | null>(null);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [filename, setFilename] = useState("choda-capture.png");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = (): void => {
    setStage("idle");
    setRaw(null);
    setDataUrl(null);
    setError(null);
  };

  const capture = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      // Snipping-Tool style: grab the whole screen, then let the user snip a
      // region (CaptureRegion) before saving.
      setRaw(await captureScreenshotDataUrl());
      setFilename(captureFilename(new Date()));
      setStage("region");
    } catch (e) {
      // Rejection is normal if the user cancels the picker or capture isn't
      // granted (plain browser) — surface it, don't crash.
      setError(e instanceof Error ? e.message : "screen capture failed or was cancelled");
    } finally {
      setBusy(false);
    }
  };

  const shareImage = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    setError(null);
    try {
      setDataUrl(await readImageFileAsDataUrl(file));
      setFilename(file.name || "shared-image.png");
      setStage("preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "couldn’t read the image");
    }
  };

  // TASK-1498 AC-1 — Ctrl+V an image to preview it. A non-image paste carries no
  // image item, so imageFileFromClipboard returns null and we do nothing — normal
  // paste behavior is left untouched.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent): void => {
      const file = imageFileFromClipboard(e.clipboardData?.items);
      if (file) void shareImage(file);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, []);

  return (
    <section aria-label="capture" className="flex-1 min-h-0 overflow-y-auto">

      <div className="flex items-center gap-2 mb-4">
        <button
          type="button"
          onClick={capture}
          disabled={busy}
          className="px-3 py-1.5 rounded-md text-sm bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? "Capturing…" : "Capture screen"}
        </button>
        <label className="px-3 py-1.5 rounded-md text-sm bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer">
          Share an image…
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => void shareImage(e.target.files?.[0])}
          />
        </label>
      </div>

      {error && (
        <p role="alert" className="text-sm text-rose-700 dark:text-rose-400 mb-3">
          {error}
        </p>
      )}

      {stage === "region" && raw !== null ? (
        <CaptureRegion
          src={raw}
          onCropped={(url) => {
            setDataUrl(url);
            setStage("preview");
          }}
        />
      ) : stage === "preview" && dataUrl !== null ? (
        <div className="flex flex-col gap-3">
          <CapturePreview dataUrl={dataUrl} filename={filename} onClear={reset} />
          <CaptureSendPanel
            dataUrl={dataUrl}
            projectId={projectId}
            connected={health.conn !== "disconnected"}
          />
        </div>
      ) : (
        // Idle is empty by nature, not by failure — nothing has been captured
        // yet, and the description is the instructions for changing that.
        <EmptyState
          icon="ti-camera"
          title="Nothing captured yet"
          description="Capture the screen (then snip a region, Snipping-Tool style), share an image, or paste one (Ctrl+V), then save it to disk, copy it, or send it to a conversation. Screen capture is granted inside the Choda Companion app."
        />
      )}
    </section>
  );
}

type CaptureMode = "screenshot" | "meeting";

const MODES: CaptureMode[] = ["screenshot", "meeting"];
const MODE_LABELS: Record<CaptureMode, string> = {
  screenshot: "Screenshot",
  meeting: "Meeting",
};

export function CaptureView(): React.JSX.Element {
  const [params, setParams] = useSearchParams();
  const mode: CaptureMode = params.get("mode") === "meeting" ? "meeting" : "screenshot";

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <h1 className="flex-none text-lg font-medium mb-3">Capture</h1>
      <div
        role="tablist"
        aria-label="capture modes"
        className="flex-none mb-4 flex gap-1 border-b border-zinc-200 dark:border-zinc-800"
      >
        {MODES.map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            data-testid={`capture-tab-${m}`}
            onClick={() => setParams(m === "screenshot" ? {} : { mode: m }, { replace: true })}
            className={[
              "px-3 py-1.5 text-sm -mb-px border-b-2",
              mode === m
                ? "border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100 font-medium"
                : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200",
            ].join(" ")}
          >
            {MODE_LABELS[m]}
          </button>
        ))}
      </div>

      {/* Only the active tab mounts. That scopes the Ctrl+V image-paste listener
          to the Screenshot tab, so pasting while on the Meeting tab does not
          yank you into a screenshot preview. Leaving the Meeting tab does NOT
          stop a recording — the recorder lives in Shell, not in this view. */}
      {mode === "screenshot" ? <ScreenshotCapture /> : <MeetingsView />}
    </div>
  );
}
