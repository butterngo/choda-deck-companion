// TASK-2142 — make an HTML report's relative <img src> visible in the Docs pane.
//
// HtmlDocView renders the file as <iframe sandbox="" srcdoc>. A srcdoc
// document's base URL is about:srcdoc, so `<img src="screenshots/a.png">`
// resolves to nothing — and pointing the frame at the adapter instead is not an
// option, because the route is gated on a header a sandboxed frame cannot send
// (TASK-1956). So the APP fetches each image, where it can send the token, and
// hands the frame a data: URI in its place.
//
// Only the attribute VALUE is rewritten, by string splice. Re-serialising the
// document through DOMParser would also "fix" it — drop the doctype, reorder
// attributes, close tags — and the frame would then render something that is
// not quite the file on disk.

/** `<img … src="…">` — group 1 is the quote, group 2 the raw value. */
const IMG_SRC = /<img\b[^>]*?\ssrc\s*=\s*(["'])(.*?)\1/gis;

/** Sources the frame can already resolve, or that must never become a request. */
const NOT_RELATIVE = /^(?:[a-z][a-z0-9+.-]*:|\/\/|\/|#)/i;

/**
 * Resolve `src` against the directory of `docPath`, both workspace-relative.
 *
 * Returns null for anything that is not a plain relative path, or that climbs
 * above the workspace root — the adapter would refuse the latter anyway, but a
 * request that is known to be refused should not be sent at all.
 */
export function resolveReportImage(docPath: string, src: string): string | null {
  const raw = src.trim().replace(/&amp;/g, "&");
  if (raw === "" || NOT_RELATIVE.test(raw)) return null;

  let rel: string;
  try {
    rel = decodeURIComponent(raw.split(/[?#]/)[0] ?? "");
  } catch {
    return null; // a malformed %-escape is not a path worth guessing at
  }

  const parts = docPath.split("/").slice(0, -1);
  for (const seg of rel.split(/[/\\]/)) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (parts.length === 0) return null;
      parts.pop();
      continue;
    }
    parts.push(seg);
  }
  return parts.length === 0 ? null : parts.join("/");
}

/**
 * Replace every relative <img src> in `html` with what `fetchImage` returns for
 * it. A null from `fetchImage` (404, an older adapter still answering 415) leaves
 * that src exactly as it was: the report renders, just without that image.
 *
 * Each distinct path is fetched once, however many times it is referenced.
 */
export async function inlineReportImages(
  html: string,
  docPath: string,
  fetchImage: (path: string) => Promise<string | null>
): Promise<string> {
  const wanted = new Set<string>();
  for (const m of html.matchAll(IMG_SRC)) {
    const resolved = resolveReportImage(docPath, m[2] ?? "");
    if (resolved !== null) wanted.add(resolved);
  }
  if (wanted.size === 0) return html;

  const fetched = new Map<string, string | null>();
  await Promise.all(
    [...wanted].map(async (p) => {
      fetched.set(p, await fetchImage(p).catch(() => null));
    })
  );

  return html.replace(IMG_SRC, (whole, quote: string, value: string) => {
    const resolved = resolveReportImage(docPath, value);
    const dataUri = resolved === null ? null : fetched.get(resolved) ?? null;
    if (dataUri === null) return whole;
    // Splice the value only; everything else in the tag stays byte-for-byte.
    const at = whole.lastIndexOf(`${quote}${value}${quote}`);
    return `${whole.slice(0, at)}${quote}${dataUri}${quote}${whole.slice(at + value.length + 2)}`;
  });
}
