// TASK-1617 — most conversation titles are machine-generated, and the list was
// treating them as prose.
//
// Measured against the live store: of the threads on screen, the majority were
// `Screenshot from http://localhost:3000/tung-nike-store/remote-workflow/automation`
// or `GET https://graph.microsoft.com/v1.0/users/hngo1@mantu.com/photo/$value`.
// Rendered as plain truncated titles they drown the handful of real
// discussions, which are the only threads anyone reads.
//
// Classifying them is not cosmetic: it is what lets the list filter to
// "discussions" and give captures a quieter voice.

export type ConversationKind = "capture" | "request" | "discussion";

export interface ConversationLabel {
  kind: ConversationKind;
  /** What to show in a list row. For a URL, host + last path segment. */
  label: string;
  /** Full original title, for `title=` on hover. */
  full: string;
}

const CAPTURE_RE = /^Screenshot from\s+(.*)$/i;
const REQUEST_RE = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(https?:\/\/\S+)/i;
// Found by checking the classifier against the live store rather than trusting
// it: `Network bundle (25 requests) from http://localhost:3002/admin/projects`
// is a third machine-generated shape, and it was landing in "Discussions".
const BUNDLE_RE = /^Network bundle\s*\(([^)]*)\)\s*from\s+(\S+)/i;

/**
 * `http://localhost:3000/a/b/automation` → `localhost:3000 … /automation`
 *
 * Truncating a URL from the right (the default for any text) keeps the
 * protocol and hostname and throws away the path — exactly backwards, since
 * every one of these shares a host and differs only at the end.
 */
function shortenUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw;
  }
  const host = url.host;
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length === 0) return host;
  const last = segments[segments.length - 1] ?? "";
  return segments.length === 1 ? `${host}/${last}` : `${host} … /${last}`;
}

export function conversationLabel(title: string): ConversationLabel {
  const capture = CAPTURE_RE.exec(title);
  if (capture?.[1]) {
    const source = capture[1].trim();
    return {
      kind: "capture",
      // `Screenshot from unknown` is a real value in the store — it is not a
      // URL and must not be run through the shortener.
      label: /^https?:\/\//i.test(source) ? shortenUrl(source) : source,
      full: title,
    };
  }

  const request = REQUEST_RE.exec(title);
  if (request?.[2]) {
    return { kind: "request", label: shortenUrl(request[2]), full: title };
  }

  const bundle = BUNDLE_RE.exec(title);
  if (bundle?.[2]) {
    // The request count is the useful part of the label — it says how big the
    // capture is — so it survives the shortening rather than the hostname.
    return { kind: "request", label: `${bundle[1]} · ${shortenUrl(bundle[2])}`, full: title };
  }

  return { kind: "discussion", label: title, full: title };
}

/**
 * The etiquette requires every turn to state a position, and turns comply by
 * opening with `Position: needs_clarification.` — so it arrives as the first
 * line of prose rather than as a field. Lifting it out is what makes a thread
 * scannable, since the position is the one thing you look for.
 */
export function extractPosition(content: string): string | null {
  const m = /^\s*Position:\s*([a-z_]+)/im.exec(content);
  return m?.[1] ? m[1].toLowerCase() : null;
}

/**
 * Strip the position line once it is being rendered as a badge — but ONLY when
 * the line carries nothing else.
 *
 * Real turns come in two shapes, and the store has both:
 *
 *   Position: signoff.
 *   Position: needs_clarification — on optionsSource cutover timing.
 *
 * The first is pure boilerplate and duplicating it under a badge is noise. The
 * second carries the author's actual qualifier, and stripping it would delete
 * meaning to save a word. So the badge summarises and the line stays.
 */
export function stripPositionLine(content: string): string {
  return content.replace(/^\s*Position:\s*[a-z_]+\.?\s*$/im, "").replace(/^\s*\n/, "");
}
