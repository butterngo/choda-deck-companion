// TASK-1494 — shows a captured/shared image with Save-to-disk + Copy-to-clipboard
// actions. Pure/presentational (takes a data URL); the CaptureView owns how the
// image was produced (screen capture vs file share).

import { useState } from "react";
import { dataUrlToBlob } from "../lib/capture";

export interface CapturePreviewProps {
  dataUrl: string;
  filename: string;
  onClear: () => void;
}

export function CapturePreview({ dataUrl, filename, onClear }: CapturePreviewProps): React.JSX.Element {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = (): void => {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = filename;
    a.click();
  };

  const copy = async (): Promise<void> => {
    try {
      const blob = dataUrlToBlob(dataUrl);
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      setCopied(true);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "copy failed");
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          className="px-3 py-1.5 rounded-md text-sm bg-blue-600 text-white hover:bg-blue-700"
        >
          Save to disk
        </button>
        <button
          type="button"
          onClick={copy}
          className="px-3 py-1.5 rounded-md text-sm bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700"
        >
          {copied ? "Copied ✓" : "Copy to clipboard"}
        </button>
        <button
          type="button"
          onClick={onClear}
          className="ml-auto px-3 py-1.5 rounded-md text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          Clear
        </button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-rose-700 dark:text-rose-400">
          {error}
        </p>
      )}
      <img
        src={dataUrl}
        alt="capture preview"
        className="max-w-full rounded-md border border-zinc-200 dark:border-zinc-800"
      />
    </div>
  );
}
