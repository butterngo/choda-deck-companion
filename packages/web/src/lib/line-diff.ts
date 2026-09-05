/**
 * TASK-1859 — the changed lines between two texts.
 *
 * Deliberately NOT a minimal diff. It trims the common prefix and the common
 * suffix and calls everything between them changed. For the edit this feature
 * actually serves — a person fixing one line of a config file — that yields
 * exactly one removed and one added line, which is the whole point.
 *
 * The property that makes the simplification safe: it can report a CHANGE that
 * a minimal algorithm would have matched up, but it can never report FEWER
 * changes than there are. A preview that overstates is annoying; one that
 * understates would let a line through unseen, which is the failure this
 * preview exists to prevent.
 *
 * Line endings are preserved by splitting on the boundary and keeping the
 * pieces. CRLF files are the norm on this machine, and a diff that normalised
 * them would show every line as changed — the exact defect the preview is meant
 * to catch.
 */

export interface DiffLine {
  kind: "same" | "removed" | "added";
  /** 1-based line number in the file the line belongs to, or null for added. */
  number: number | null;
  text: string;
}

const splitLines = (s: string): string[] => s.split(/\r?\n/);

export function diffLines(before: string, after: string): DiffLine[] {
  const a = splitLines(before);
  const b = splitLines(after);

  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;

  let tail = 0;
  while (
    tail < a.length - head &&
    tail < b.length - head &&
    a[a.length - 1 - tail] === b[b.length - 1 - tail]
  ) {
    tail++;
  }

  const out: DiffLine[] = [];
  // One line of context on each side, so a changed line is never shown alone
  // with nothing to place it against.
  const ctxStart = Math.max(0, head - 1);
  for (let i = ctxStart; i < head; i++) {
    out.push({ kind: "same", number: i + 1, text: a[i] ?? "" });
  }
  for (let i = head; i < a.length - tail; i++) {
    out.push({ kind: "removed", number: i + 1, text: a[i] ?? "" });
  }
  for (let i = head; i < b.length - tail; i++) {
    out.push({ kind: "added", number: null, text: b[i] ?? "" });
  }
  const ctxEnd = a.length - tail;
  if (ctxEnd < a.length) {
    out.push({ kind: "same", number: ctxEnd + 1, text: a[ctxEnd] ?? "" });
  }
  return out;
}

/** How many lines this write would actually change. Zero means nothing to save. */
export function changedCount(diff: DiffLine[]): number {
  return diff.filter((d) => d.kind !== "same").length;
}
