// TASK-1794 — which lines of the CURRENT file a commit changed, and whether we
// are still entitled to say so.
//
// The naive version of this file is three lines: collect every `add` line's
// newNo and hand them to the viewer. That version is wrong in a way that leaves
// no trace.
//
// The file pane serves the file as it is on disk NOW (`useWorkspaceDoc` reads the
// working tree). The hunk's line numbers describe the file as it was at that
// commit. For the newest commit touching a file those agree; for an older one
// they need not, because everything committed since may have shifted the lines.
// Marking line 160 anyway points a reader at innocent code with full confidence,
// and nothing about the rendered result announces the mistake. ADR-032 tolerates
// exactly this drift for code_refs on purpose — but it anchors on symbols and
// says so, whereas a highlight is rendered as fact.
//
// Fetching the file at the sha would settle it, and is not available: no adapter
// route exists, and a new one would not reach the packaged app until a release
// (INBOX-1888). It is also not needed. Every `add` line carries its TEXT, so
// comparing that text against the current file's line N is exact, free, and
// answers the only question that matters — is this still the line the commit
// wrote?

import type { CommitFileStat } from "../api";

export interface ChangedLines {
  /** Lines confirmed to still hold the text the commit added. Safe to mark. */
  marked: ReadonlySet<number>;
  /**
   * How many added lines could NOT be placed in the current file. Non-zero means
   * the file moved on; the pane must say so rather than mark them anyway.
   */
  drifted: number;
}

/**
 * Every line number this commit ADDED to the file.
 *
 * Deletions contribute nothing on purpose. A removed line has no line in the
 * current file to mark, and its `oldNo` addresses a position that now holds
 * something else — marking it would highlight unrelated code and look
 * deliberate.
 */
export function addedLineNumbers(file: CommitFileStat): number[] {
  if (!file.hunks) return [];
  const out: number[] = [];
  for (const h of file.hunks) {
    for (const l of h.lines) {
      if (l.kind === "add" && l.newNo !== null) out.push(l.newNo);
    }
  }
  return out;
}

/**
 * Resolve the commit's added lines against the file's CURRENT text.
 *
 * `code` is the file as the docs endpoint serves it today. A line is marked only
 * when the text there still equals what the commit added.
 */
export function resolveChangedLines(file: CommitFileStat, code: string): ChangedLines {
  const current = code.replace(/\n$/, "").split("\n");
  const marked = new Set<number>();
  let drifted = 0;

  if (!file.hunks) return { marked, drifted };

  for (const h of file.hunks) {
    for (const l of h.lines) {
      if (l.kind !== "add" || l.newNo === null) continue;
      // `current` is 0-based; hunk numbers are 1-based.
      const now = current[l.newNo - 1];
      // Trailing whitespace is not a difference worth calling drift — git
      // records the line as written, and an editor or formatter may have
      // trimmed it without moving anything.
      if (now !== undefined && now.trimEnd() === l.text.trimEnd()) marked.add(l.newNo);
      else drifted += 1;
    }
  }

  return { marked, drifted };
}
