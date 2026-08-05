// TASK-1576 — the Vault browser: notes from `30-Knowledge/` rendered with their
// embedded frames. The vault is a separate store from the SQLite every other
// pillar reads, and until now nothing in the companion could see it at all.
//
// Read-only by design. Editing would mean conflict handling against a directory
// Butter edits by hand and Claude writes to — a much larger problem.

import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import type { HealthView } from "../hooks/use-health";
import { rewriteVaultAssetPaths, type VaultNoteSummary } from "../api";
import { useVaultNote, useVaultNotes } from "../hooks/use-vault";
import { CaptureMarkdown } from "../components/CaptureMarkdown";

function NoteRow({
  note,
  selected,
  onSelect,
}: {
  note: VaultNoteSummary;
  selected: boolean;
  onSelect: (slug: string) => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={() => onSelect(note.slug)}
      aria-current={selected ? "true" : undefined}
      className={`w-full text-left px-3 py-2 rounded border mb-1 ${
        selected
          ? "border-sky-500 bg-sky-50 dark:bg-sky-950/40"
          : "border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900"
      }`}
    >
      <span className="block text-sm font-medium">{note.title}</span>
      <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
        {note.captured !== null && <span>{note.captured}</span>}
        {/* Provenance, not decoration: 30-Knowledge is otherwise hand-written,
            so a generated summary must stay visibly distinguishable from a note
            Butter reasoned through. */}
        {note.generatedBy === "claude" && (
          <span className="rounded bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5">generated</span>
        )}
        {note.tags.slice(0, 3).map((t) => (
          <span key={t}>#{t}</span>
        ))}
      </span>
    </button>
  );
}

export function VaultView(): React.JSX.Element {
  const health = useOutletContext<HealthView>();
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const list = useVaultNotes();
  const detail = useVaultNote(selectedSlug);

  return (
    <section aria-label="vault">
      <h1 className="text-lg font-medium mb-3">Vault</h1>

      {health.conn === "disconnected" || list.isError ? (
        <p role="alert" className="text-sm text-rose-700 dark:text-rose-400">
          Can’t reach the laptop API — vault notes are unavailable.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            {list.isLoading ? (
              <p className="text-sm text-zinc-500">Loading notes…</p>
            ) : list.notes.length === 0 ? (
              // A configured-but-empty vault and an unconfigured one look the
              // same from here; say so rather than implying there are no notes.
              <p className="text-sm text-zinc-500">
                No notes found. The adapter serves these only when CHODA_VAULT_DIR is set.
              </p>
            ) : (
              // Bounded pane — TASK-1574: an unbounded list made the page
              // ~17,000px tall and pushed the detail out of the viewport.
              <div
                data-testid="vault-list-pane"
                className="max-h-[calc(100vh-18rem)] overflow-y-auto pr-1"
              >
                {list.notes.map((n) => (
                  <NoteRow
                    key={n.slug}
                    note={n}
                    selected={n.slug === selectedSlug}
                    onSelect={setSelectedSlug}
                  />
                ))}
              </div>
            )}
            {health.conn === "stale" && (
              <p className="mt-3 text-xs text-zinc-400">Possibly stale — see the status bar.</p>
            )}
          </div>

          <div data-testid="vault-detail-pane" className="max-h-[calc(100vh-14rem)] overflow-y-auto">
            {selectedSlug === null ? (
              <p className="text-sm text-zinc-500">Select a note to read it.</p>
            ) : detail.isError ? (
              <p role="alert" className="text-sm text-rose-700 dark:text-rose-400">
                Couldn’t load {selectedSlug}.
              </p>
            ) : detail.isLoading || detail.markdown === null ? (
              <p className="text-sm text-zinc-500">Loading…</p>
            ) : (
              // Relative `assets/...` paths resolve on disk but not in a browser,
              // so they are rewritten to the asset route before rendering.
              <CaptureMarkdown>{rewriteVaultAssetPaths(detail.markdown)}</CaptureMarkdown>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
