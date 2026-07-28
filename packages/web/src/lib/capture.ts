// TASK-1494 — screen-capture / share-image helpers. captureScreenshotDataUrl()
// drives the Electron-granted getDisplayMedia (electron/main.cjs's
// setDisplayMediaRequestHandler), grabs ONE frame to a PNG data URL, then stops
// the track. The pure helpers (filename, dataURL↔blob, file read) are split out
// so they're unit-testable without a real display.

export function captureFilename(d: Date): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(
    d.getMinutes(),
  )}${pad(d.getSeconds())}`;
  return `choda-capture-${stamp}.png`;
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(",");
  const meta = dataUrl.slice(0, comma);
  const b64 = dataUrl.slice(comma + 1);
  const mime = /data:([^;]+)/.exec(meta)?.[1] ?? "image/png";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export function readImageFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error ?? new Error("failed to read file"));
    fr.readAsDataURL(file);
  });
}

// Grab a single screenshot frame. Only works where getDisplayMedia is granted —
// the Electron app (via the main-process handler); a plain browser will prompt
// or reject. Always stops the track so the OS "sharing" indicator clears.
export async function captureScreenshotDataUrl(): Promise<string> {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  try {
    const track = stream.getVideoTracks()[0];
    const video = document.createElement("video");
    video.srcObject = stream;
    await video.play();
    // Let one frame paint before grabbing it.
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    const settings = track?.getSettings() ?? {};
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || settings.width || 1920;
    canvas.height = video.videoHeight || settings.height || 1080;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d canvas context");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    video.pause();
    return canvas.toDataURL("image/png");
  } finally {
    stream.getTracks().forEach((t) => t.stop());
  }
}
