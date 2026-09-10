// TASK-1937 — where the ```mermaid fences are in a markdown document.
//
// ⚠ THIS IS A SECOND IMPLEMENTATION. The authority is the adapter's
// `listMermaidFences` in choda-deck/src/adapters/companion/mermaid-check.ts, and
// `fenceIndex` in every request means *that* function's index. The two live in
// different repositories and cannot import each other, so they are kept
// deliberately identical in behaviour rather than shared.
//
// The risk is real and worth naming: if one of them changes what counts as a
// fence, a request would edit a different diagram than the reader chose, and
// nothing would report it — the edit would simply land somewhere else. The
// tests below pin the two properties that matter (ordinal, and CRLF parity);
// they cannot pin agreement with code in another repo.
//
// The other rule carried over verbatim: `code` is the VERBATIM slice, carriage
// returns included. A replacement built from a normalised copy converts that
// fence to LF and makes `git diff` report every line of it as changed.

export interface MermaidFence {
  /** Position among mermaid fences in this document, 0-based. */
  index: number;
  /** The fence body, exactly as it appears — no ``` markers, no normalisation. */
  code: string;
  /** 1-based line of the first body line. */
  start: number;
  /** 1-based line of the last body line. */
  end: number;
}

export function listMermaidFences(markdown: string): MermaidFence[] {
  const lines = markdown.split("\n");
  const fences: MermaidFence[] = [];
  let i = 0;
  while (i < lines.length) {
    if (/^\s*```mermaid\s*\r?$/.test(lines[i] ?? "")) {
      const bodyStart = i + 2;
      let j = i + 1;
      while (j < lines.length && !/^\s*```\s*\r?$/.test(lines[j] ?? "")) j += 1;
      fences.push({
        index: fences.length,
        code: lines.slice(bodyStart - 1, j).join("\n"),
        start: bodyStart,
        end: j,
      });
      i = j + 1;
      continue;
    }
    i += 1;
  }
  return fences;
}

/**
 * Replace one fence's body, touching nothing else in the document.
 *
 * The replacement is spliced by LINE RANGE rather than by string search: two
 * identical diagrams in one file are not a hypothetical in a document that
 * shows a before and an after, and a search-and-replace would silently edit the
 * first one.
 */
export function replaceFence(markdown: string, fence: MermaidFence, code: string): string {
  const lines = markdown.split("\n");
  // Match the document's own line endings. The fence's existing lines are the
  // only evidence of what they are — a document can be mixed, and guessing from
  // the first line would rewrite the rest.
  const crlf = (lines[fence.start - 1] ?? "").endsWith("\r");
  const replacement = code.split(/\r?\n/).map((l) => (crlf ? `${l}\r` : l));
  return [...lines.slice(0, fence.start - 1), ...replacement, ...lines.slice(fence.end)].join("\n");
}
