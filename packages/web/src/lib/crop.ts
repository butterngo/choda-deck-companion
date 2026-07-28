// TASK-1494 (snipping-tool refinement) — region-crop helpers. getDisplayMedia
// only captures the whole screen, so a Snipping-Tool-style region select is a
// post-capture crop: the user drags a rectangle over the screenshot, we scale it
// from displayed pixels to the image's natural pixels and crop via canvas. The
// rect math is pure so it's unit-testable without a browser.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Turn a drag (start → current) into a positive-size rect.
export function normalizeRect(x0: number, y0: number, x1: number, y1: number): Rect {
  return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
}

// Map a rect from displayed-image pixels to the image's natural pixels.
export function scaleRect(
  r: Rect,
  displayW: number,
  displayH: number,
  naturalW: number,
  naturalH: number,
): Rect {
  const sx = displayW === 0 ? 1 : naturalW / displayW;
  const sy = displayH === 0 ? 1 : naturalH / displayH;
  return { x: r.x * sx, y: r.y * sy, w: r.w * sx, h: r.h * sy };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = src;
  });
}

// Crop a data URL to a natural-pixel rect via canvas. Browser-only.
export async function cropImage(dataUrl: string, r: Rect): Promise<string> {
  const img = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(r.w));
  canvas.height = Math.max(1, Math.round(r.h));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d canvas context");
  ctx.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}
