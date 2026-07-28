// TASK-1494 (snipping-tool refinement) — drag a rectangle over the captured
// screenshot to crop a region, Snipping-Tool style. Skipping the drag keeps the
// whole image. Emits the resulting data URL to the parent, which then shows the
// Save/Copy preview.

import { useRef, useState } from "react";
import { normalizeRect, scaleRect, cropImage, type Rect } from "../lib/crop";

export interface CaptureRegionProps {
  src: string;
  onCropped: (dataUrl: string) => void;
}

interface Drag {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function CaptureRegion({ src, onCropped }: CaptureRegionProps): React.JSX.Element {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [busy, setBusy] = useState(false);

  const rect: Rect | null =
    drag && (Math.abs(drag.x1 - drag.x0) > 2 || Math.abs(drag.y1 - drag.y0) > 2)
      ? normalizeRect(drag.x0, drag.y0, drag.x1, drag.y1)
      : null;

  const local = (ev: React.PointerEvent): { x: number; y: number } => {
    const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  };

  const crop = async (): Promise<void> => {
    const img = imgRef.current;
    if (!img || !rect) return;
    setBusy(true);
    try {
      const natural = scaleRect(rect, img.clientWidth, img.clientHeight, img.naturalWidth, img.naturalHeight);
      onCropped(await cropImage(src, natural));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={crop}
          disabled={!rect || busy}
          className="px-3 py-1.5 rounded-md text-sm bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Crop selection
        </button>
        <button
          type="button"
          onClick={() => onCropped(src)}
          className="px-3 py-1.5 rounded-md text-sm bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700"
        >
          Use whole image
        </button>
        <span className="text-xs text-zinc-500">Drag a rectangle to snip a region.</span>
      </div>

      <div
        className="relative inline-block select-none touch-none w-fit"
        onPointerDown={(e) => {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          const p = local(e);
          setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
        }}
        onPointerMove={(e) => {
          if (!drag) return;
          const p = local(e);
          setDrag((d) => (d ? { ...d, x1: p.x, y1: p.y } : d));
        }}
        onPointerUp={() => void 0}
      >
        <img
          ref={imgRef}
          src={src}
          alt="capture to crop"
          draggable={false}
          className="max-w-full rounded-md border border-zinc-200 dark:border-zinc-800"
        />
        {rect && (
          <div
            data-selection
            className="absolute border-2 border-blue-500 bg-blue-500/10 pointer-events-none"
            style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
          />
        )}
      </div>
    </div>
  );
}
