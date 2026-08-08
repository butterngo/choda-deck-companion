// TASK-1576 — the Vault browser: notes from `30-Knowledge/` rendered with their
// embedded frames. The vault is a separate store from the SQLite every other
// pillar reads, and until now nothing in the companion could see it at all.
//
// Read-only by design. Editing would mean conflict handling against a directory
// Butter edits by hand and Claude writes to — a much larger problem.
//
// TASK-1616 — the view had no way to find anything: 54 notes, 30 tags, and not
// a single filter field. The list is now narrow with a filter over titles and
// tags, and the note takes the room it needs.

import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import type { HealthView } from "../hooks/use-health";
import { rewriteVaultAssetPaths } from "../api";
import { useVaultNote, useVaultNotes } from "../hooks/use-vault";
import { CaptureMarkdown } from "../components/CaptureMarkdown";
import { VaultList } from "../components/VaultList";
import { ErrorState } from "../components/state/ErrorState";
import { EmptyState } from "../components/state/EmptyState";
import { Skeleton } from "../components/state/Skeleton";

export function VaultView(): React.JSX.Element {
  const health = useOutletContext<HealthView>();
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const list = useVaultNotes();
  const detail = useVaultNote(selectedSlug);

  const selected = list.notes.find((n) => n.slug === selectedSlug) ?? null;

  function body(): React.JSX.Element {
    if (health.conn === "disconnected") {
      // ADR-028 — unreachable is not the same fact as a failed query. A 401
      // from this token-gated route used to report "Can't reach the laptop
      // API", which sent debugging in the wrong direction.
      return (
        <ErrorState
          variant="unreachable"
          description="Vault notes are unavailable — this is not an empty vault."
        />
      );
    }
    if (list.isError) {
      return (
        <ErrorState
          variant="failed"
          subject="vault notes"
          description="The vault routes are token-gated; a dev server without CHODA_BRIDGE_TOKEN gets a 401 here."
          action={
            <button
              type="button"
              onClick={list.refetch}
              className="px-3 py-1.5 rounded-md text-sm border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              Try again
            </button>
          }
        />
      );
    }
    if (list.isLoading) return <Skeleton shape="list" label="Loading vault notes…" />;
    if (list.notes.length === 0) {
      // A configured-but-empty vault and an unconfigured one look the same from
      // here; say so rather than implying there are no notes.
      return (
        <EmptyState
          icon="ti-notebook"
          title="No notes found"
          description="The adapter serves these only when CHODA_VAULT_DIR is set."
        />
      );
    }

    return (
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(260px,340px)_1fr] gap-6">
        <VaultList notes={list.notes} selectedSlug={selectedSlug} onSelect={setSelectedSlug} />

        <div
          data-testid="vault-detail-pane"
          className="min-w-0 max-h-[calc(100vh-14rem)] overflow-y-auto"
        >
          {selectedSlug === null ? (
            <EmptyState
              icon="ti-notebook"
              title="No note selected"
              description="Pick a note on the left to read it, with its captured frames in place."
            />
          ) : detail.isError ? (
            <ErrorState variant="failed" subject={selectedSlug} />
          ) : detail.isLoading || detail.markdown === null ? (
            <Skeleton shape="text" label="Loading note…" />
          ) : (
            <article>
              {selected && (
                <header className="pb-3.5 mb-4 border-b border-zinc-100 dark:border-zinc-800">
                  <h2 className="text-[17px] leading-snug font-medium text-balance">
                    {selected.title.replace(/^["']|["']$/g, "")}
                  </h2>
                  <div className="mt-2 flex items-center gap-2 flex-wrap text-[11.5px] text-zinc-500">
                    {selected.generatedBy === "claude" && (
                      <span className="rounded-full bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 px-2 py-0.5 font-medium">
                        generated
                      </span>
                    )}
                    {selected.captured && <span>captured {selected.captured}</span>}
                    {selected.url && (
                      <a
                        href={selected.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-violet-700 dark:text-violet-300 hover:underline truncate max-w-[280px]"
                      >
                        {selected.source ?? selected.url}
                      </a>
                    )}
                    {selected.tags.length > 0 && (
                      <span className="flex items-center gap-1 flex-wrap">
                        {selected.tags.map((t) => (
                          <span
                            key={t}
                            className="rounded-full border border-violet-200 dark:border-violet-900 text-violet-700 dark:text-violet-300 px-1.5"
                          >
                            #{t}
                          </span>
                        ))}
                      </span>
                    )}
                  </div>
                </header>
              )}
              {/* Relative `assets/...` paths resolve on disk but not in a
                  browser, so they are rewritten to the asset route. */}
              <CaptureMarkdown>{rewriteVaultAssetPaths(detail.markdown)}</CaptureMarkdown>
            </article>
          )}
        </div>
      </div>
    );
  }

  return (
    <section aria-label="vault">
      <div className="flex items-baseline gap-2 mb-4">
        <h1 className="text-lg font-medium">Vault</h1>
        <span className="text-xs text-zinc-400">30-Knowledge · read-only</span>
      </div>
      {body()}
      {health.conn === "stale" && (
        <p className="mt-3 text-xs text-zinc-400">Possibly stale — see the status bar.</p>
      )}
    </section>
  );
}
