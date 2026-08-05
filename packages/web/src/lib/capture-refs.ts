// TASK-1569 — resolve a capture artifact reference found in an entry body into a
// URL this app can actually fetch.
//
// Capture bodies embed a path to a file under the laptop's artifacts dir. Since
// TASK-1567 that path is artifacts-relative (`captures/ab12.png`); entries captured
// before it carry a machine-absolute one (`C:\dev\choda-deck\data\artifacts\
// captures\ab12.png`). Both must render, so legacy paths are normalized here
// rather than migrated in the database.
//
// The resolved URL goes through `/api`, whose proxy injects x-choda-bridge-token —
// GET /artifacts/* is token-gated (TASK-1566), and the web app never sees the token.

import { API_BASE } from "../config";

// Everything the capture pipeline writes lives under this single prefix, so it is
// the one anchor a legacy absolute path can be re-based on.
const CAPTURES_SEGMENT = "captures/";

// Rendered inline as an image; anything else becomes a download link. Kept narrow
// on purpose — a .har or .jsonl in an <img> is a broken icon, not a preview.
const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".gif"];

/** True when the ref points at a capture artifact this app can serve. */
export function isCaptureRef(ref: string): boolean {
  return toArtifactsRelative(ref) !== null;
}

/** True when the (already-resolved) ref should render as an <img>. */
export function isImageRef(ref: string): boolean {
  const rel = toArtifactsRelative(ref) ?? ref;
  const lower = (rel.split("?")[0] ?? rel).toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Reduce a ref to its artifacts-relative form, or null when it isn't a capture ref.
 *
 * Absolute paths are re-based on the LAST `captures/` segment rather than stripped
 * by a fixed prefix: the artifacts root differs per machine (and per profile), so
 * there is no prefix to hard-code. Backslashes are normalized first, since legacy
 * paths were written by Windows `path.join`.
 */
export function toArtifactsRelative(ref: string): string | null {
  if (!ref) return null;
  // An external URL is never a capture ref, even if its path happens to contain
  // `captures/` — don't rewrite someone's linked screenshot on the web.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(ref)) return null;
  if (ref.startsWith("#") || ref.startsWith("/api/")) return null;

  const normalized = ref.replace(/\\/g, "/");
  const idx = normalized.lastIndexOf(CAPTURES_SEGMENT);
  if (idx === -1) return null;
  const rel = normalized.slice(idx);
  // `captures/` alone, with nothing after it, addresses no file.
  return rel.length > CAPTURES_SEGMENT.length ? rel : null;
}

/**
 * Rewrite legacy absolute capture paths inside markdown link destinations to
 * their relative form, BEFORE the markdown is parsed.
 *
 * This has to happen pre-parse. CommonMark treats a backslash as an escape
 * character inside a link destination, so a body written before TASK-1567 —
 * `![capture](C:\dev\choda-deck\data\artifacts\captures\ab12.png)` — parses to an
 * image node with NO url at all. By the time a component sees it there is nothing
 * left to resolve. Verified: the resolver's own unit test passes on that path
 * while the rendered <img> came out with an undefined src.
 *
 * Only destinations that are already capture refs are touched; everything else is
 * returned character-for-character.
 */
export function normalizeCaptureBody(markdown: string): string {
  return markdown.replace(/\]\(([^)]+)\)/g, (whole, dest: string) => {
    const rel = toArtifactsRelative(dest.trim());
    return rel === null ? whole : `](${rel})`;
  });
}

/**
 * Map a capture ref to its `/api/artifacts/...` URL. Non-capture refs (external
 * URLs, in-page anchors, ordinary relative links) are returned untouched so the
 * markdown renderer can pass them straight to the DOM.
 */
export function resolveCaptureRef(ref: string): string {
  const rel = toArtifactsRelative(ref);
  if (rel === null) return ref;
  // Encode per segment: a filename may legitimately contain characters that must
  // be escaped, but the slashes are structural and must survive.
  const encoded = rel.split("/").map(encodeURIComponent).join("/");
  return `${API_BASE}/artifacts/${encoded}`;
}
