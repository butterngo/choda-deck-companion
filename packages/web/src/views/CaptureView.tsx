// TASK-1494 — the Capture pillar: screenshot the screen (Electron-granted) or
// share an existing image, then Save/Copy it. Self-contained — no laptop API
// call, so it works even when the adapter is down (unlike the other pillars).

import { useState } from "react";
import {
  captureScreenshotDataUrl,
  captureFilename,
  readImageFileAsDataUrl,
} from "../lib/capture";
import { CapturePreview } from "../components/CapturePreview";

export function CaptureView(): React.JSX.Element {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [filename, setFilename] = useState("choda-capture.png");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const capture = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const url = await captureScreenshotDataUrl();
      setDataUrl(url);
      setFilename(captureFilename(new Date()));
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "couldn’t read the image");
    }
  };

  return (
    <section aria-label="capture">
      <h1 className="text-lg font-medium mb-3">Capture</h1>

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

      {dataUrl === null ? (
        <p className="text-sm text-zinc-500">
          Capture the screen or share an image, then save it to disk or copy it to the clipboard.
          Screen capture is granted inside the Choda Companion app.
        </p>
      ) : (
        <CapturePreview dataUrl={dataUrl} filename={filename} onClear={() => setDataUrl(null)} />
      )}
    </section>
  );
}
