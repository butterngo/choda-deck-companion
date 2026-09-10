// TASK-1937 — edit one mermaid fence, look at it, then save it.
//
// The ordering IS the feature. The adapter can prove a diagram parses and
// nothing more — `mermaid.render` cannot run there at all — so the picture on
// this screen is the only evidence that it actually draws, and a human looking
// at it is the only thing standing between a parseable diagram and a wrong one.
// Hence: propose, preview, confirm, save. Never propose-and-save.
//
// Read-only is narrowed here, not abandoned. Only a fence is editable; the prose
// around it stays untouchable, and a save rewrites only that fence's lines.
//
// Nothing runs on a timer or a keystroke. The model costs money and the parser
// costs CPU; both are pressed.

import { useState } from "react";
import {
  DiagramError,
  SaveDocError,
  proposeDiagram,
  saveWorkspaceDoc,
  type DiagramFailure,
  type SaveDocFailure,
} from "../api";
import { MermaidBlock } from "./MermaidBlock";
import { CapabilityNote } from "./state/CapabilityNote";
import type { MermaidFence } from "../lib/mermaid-fences";
import { replaceFence } from "../lib/mermaid-fences";

/** One sentence per failure, because "something went wrong" is not an answer. */
const SAVE_MESSAGE: Record<SaveDocFailure, string> = {
  "changed-on-disk":
    "This file changed on disk since you opened it. Your edit is still here — reopen the file to pick up the other change, then apply it again.",
  "precondition-missing":
    "The save was sent without the version it was based on, so it was refused. Reopen the file and try again.",
  "too-large": "This file is over the 2 MB the adapter will write.",
  "not-text": "The adapter will not write this file — it is not text.",
  "not-found": "That file is no longer on disk.",
  unknown: "The save failed and the adapter did not say why.",
};

const DIAGRAM_MESSAGE: Record<DiagramFailure, string> = {
  "no-model": "",
  "does-not-parse":
    "The model's diagram does not parse, so it was refused before it reached you. The original is unchanged.",
  "rate-limit": "The model is rate limited right now. Wait a moment and press again.",
  network: "The model could not be reached — check the network rather than the key.",
  auth: "The model rejected the configured key.",
  provider: "The model failed to answer.",
};

export function FenceEditor({
  workspaceId,
  rel,
  markdown,
  etag,
  fence,
  onSaved,
  onClose,
}: {
  workspaceId: string;
  rel: string;
  markdown: string;
  /** Null when the adapter predates the write route — saving is then impossible. */
  etag: string | null;
  fence: MermaidFence;
  onSaved: (markdown: string, sha256: string) => void;
  onClose: () => void;
}): React.JSX.Element {
  const [draft, setDraft] = useState(fence.code);
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState<null | "ai" | "save">(null);
  const [error, setError] = useState<string | null>(null);
  const [noModel, setNoModel] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  /** Set only by a refused proposal — the draft is NOT replaced with it. */
  const [rejected, setRejected] = useState<string | null>(null);

  const changed = draft !== fence.code;

  async function ask(): Promise<void> {
    setBusy("ai");
    setError(null);
    setNoModel(false);
    setRejected(null);
    setSaved(null);
    try {
      const answer = await proposeDiagram({
        workspaceId,
        rel,
        fenceIndex: fence.index,
        instruction,
      });
      setDraft(answer.mermaid);
    } catch (e) {
      if (!(e instanceof DiagramError)) throw e;
      if (e.kind === "no-model") setNoModel(true);
      // A refused proposal leaves the draft alone. Putting unparseable text in
      // the editor would hand the reader something the adapter already decided
      // must not be saved — and the Save button would then offer to save it.
      else if (e.kind === "does-not-parse") {
        setRejected(e.parseError);
        setError(DIAGRAM_MESSAGE[e.kind]);
      } else setError(DIAGRAM_MESSAGE[e.kind]);
    } finally {
      setBusy(null);
    }
  }

  async function save(): Promise<void> {
    if (etag === null) return;
    // Confirm before running: a mutation that writes a file the user also edits
    // by hand is not an idempotent read.
    if (!window.confirm(`Save this diagram into ${rel}?`)) return;
    setBusy("save");
    setError(null);
    setSaved(null);
    try {
      const next = replaceFence(markdown, fence, draft);
      const res = await saveWorkspaceDoc(workspaceId, rel, next, etag);
      setSaved(`Saved — ${res.bytes} bytes.`);
      onSaved(next, res.sha256);
    } catch (e) {
      if (!(e instanceof SaveDocError)) throw e;
      // The edit stays in the editor on every failure, especially the 409:
      // discarding it here is the lost edit the precondition exists to prevent.
      setError(SAVE_MESSAGE[e.kind]);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      data-testid="fence-editor"
      className="not-prose rounded-md border border-zinc-200 dark:border-zinc-800"
    >
      <div className="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-2.5 py-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
          Diagram {fence.index + 1}
        </span>
        <span className="text-[11px] tabular-nums text-zinc-400">
          lines {fence.start}–{fence.end}
        </span>
        <button
          type="button"
          data-testid="fence-close"
          onClick={onClose}
          className="ml-auto rounded-md px-1.5 py-1 text-[11px] text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          Close
        </button>
      </div>

      <div className="grid gap-3 p-2.5 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-2">
          <label className="text-[11px] text-zinc-500" htmlFor="fence-instruction">
            Ask for a change
          </label>
          <div className="flex gap-1.5">
            <input
              id="fence-instruction"
              data-testid="fence-instruction"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="e.g. add a Guardian step before the DB call"
              className="min-w-0 flex-1 rounded-md border border-zinc-200 dark:border-zinc-800 bg-transparent px-2 py-1 text-xs"
            />
            <button
              type="button"
              data-testid="fence-ask"
              disabled={busy !== null || instruction.trim() === ""}
              onClick={() => void ask()}
              className="flex-none rounded-md border border-zinc-200 dark:border-zinc-800 px-2 py-1 text-[11px] text-zinc-600 dark:text-zinc-300 disabled:opacity-40"
            >
              {busy === "ai" ? "Asking…" : "Ask AI"}
            </button>
          </div>

          <textarea
            data-testid="fence-source"
            value={draft}
            spellCheck={false}
            onChange={(e) => setDraft(e.target.value)}
            rows={14}
            className="w-full rounded-md border border-zinc-200 dark:border-zinc-800 bg-transparent p-2 font-mono text-[11px]"
          />
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          {/* Both halves, always, before a save is possible. The picture alone
              hides a rewritten label; the diff alone hides a broken layout. */}
          <span className="text-[11px] text-zinc-500">Preview</span>
          <MermaidBlock code={draft} />

          <span className="text-[11px] text-zinc-500">Changes</span>
          <pre
            data-testid="fence-diff"
            className="max-h-48 overflow-auto rounded-md border border-zinc-200 dark:border-zinc-800 p-2 text-[11px]"
          >
            {diffLines(fence.code, draft)}
          </pre>
        </div>
      </div>

      {noModel && (
        <div className="px-2.5 pb-2.5">
          <CapabilityNote icon="ti-sparkles">
            <span data-testid="fence-no-model">
              No model is configured, so the AI half is off. The editor and the
              preview work without one — configure a model in Setup to ask for a
              change.
            </span>
          </CapabilityNote>
        </div>
      )}

      {rejected !== null && (
        <p data-testid="fence-parse-error" className="px-2.5 pb-1 text-[11px] text-amber-700 dark:text-amber-400">
          Parser: {rejected}
        </p>
      )}

      {error !== null && (
        <p role="alert" data-testid="fence-error" className="px-2.5 pb-2.5 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      {saved !== null && (
        <p role="status" data-testid="fence-saved" className="px-2.5 pb-2.5 text-xs text-emerald-700 dark:text-emerald-400">
          {saved}
        </p>
      )}

      <div className="flex items-center gap-2 border-t border-zinc-200 dark:border-zinc-800 px-2.5 py-1.5">
        <span className="text-[11px] text-zinc-400">
          {etag === null
            ? "This adapter cannot save — it predates the write route."
            : changed
              ? "Edited"
              : "Unchanged"}
        </span>
        <button
          type="button"
          data-testid="fence-save"
          disabled={busy !== null || !changed || etag === null}
          onClick={() => void save()}
          className="ml-auto rounded-md border border-zinc-200 dark:border-zinc-800 px-2 py-1 text-[11px] text-zinc-600 dark:text-zinc-300 disabled:opacity-40"
        >
          {busy === "save" ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

/** A line-level diff, enough to see what moved without pulling in a library. */
function diffLines(before: string, after: string): string {
  if (before === after) return "(no changes yet)";
  const a = before.split(/\r?\n/);
  const b = after.split(/\r?\n/);
  const out: string[] = [];
  const seen = new Set(a);
  const kept = new Set(b);
  for (const line of a) if (!kept.has(line)) out.push(`- ${line}`);
  for (const line of b) if (!seen.has(line)) out.push(`+ ${line}`);
  return out.length > 0 ? out.join("\n") : "(reordered only)";
}
