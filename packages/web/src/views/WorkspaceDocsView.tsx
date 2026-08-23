// TASK-1749 — browse a workspace's own .md docs. A workspace already carries
// its cwd, so choosing one from the picker is the whole configuration.
//
// Read-only and .md-only. Editing would mean conflict handling against a
// directory Butter edits by hand and Claude writes to — the same reason
// VaultView is read-only. Serving code files is a separate decision, and
// "understand the code structure" specifically has to reckon with ADR-033,
// which retired the AST code-graph on purpose.
//
// The failure this view must not fumble: a workspace whose folder is gone is a
// FAILED load, not an empty one. Rendering an empty list there would be a
// statement about the repository that isn't true.

import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import type { HealthView } from "../hooks/use-health";
import { useWorkspaceDoc, useWorkspaceDocs } from "../hooks/use-workspace-docs";
import { CaptureMarkdown } from "../components/CaptureMarkdown";
import { DocTree } from "../components/DocTree";
import { WorkspaceSelect } from "../components/WorkspaceSelect";
import { ErrorState } from "../components/state/ErrorState";
import { EmptyState } from "../components/state/EmptyState";
import { Skeleton } from "../components/state/Skeleton";

export function WorkspaceDocsView(): React.JSX.Element {
  const health = useOutletContext<HealthView>();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const list = useWorkspaceDocs(workspaceId);
  const detail = useWorkspaceDoc(workspaceId, selectedPath);

  function pickWorkspace(id: string): void {
    setWorkspaceId(id);
    setSelectedPath(null);
  }

  function body(): React.JSX.Element {
    if (health.conn === "disconnected") {
      return (
        <ErrorState
          variant="unreachable"
          description="Workspace docs are unavailable — this is not an empty workspace."
        />
      );
    }
    if (workspaceId === null) {
      return (
        <EmptyState
          icon="ti-folder"
          title="No workspace selected"
          description="Pick a workspace above to read the markdown docs in its repository."
        />
      );
    }
    // The folder is gone. `failed`, never `unreachable` — everything else in
    // the app still works — and never an EmptyState, which would claim the
    // repository has no docs.
    if (list.missingFolder) {
      return (
        <ErrorState
          variant="failed"
          subject={`docs for ${list.missingFolder.label}`}
          description={`The folder for this workspace isn’t on disk: ${list.missingFolder.cwd}`}
        />
      );
    }
    if (list.isError) {
      return (
        <ErrorState
          variant="failed"
          subject="workspace docs"
          description="The docs route is token-gated; a dev server without CHODA_BRIDGE_TOKEN gets a 401 here."
        />
      );
    }
    if (list.isLoading) return <Skeleton shape="list" label="Loading documents…" />;
    if (list.docs.length === 0) {
      return (
        <EmptyState
          icon="ti-file-text"
          title="No documents in this workspace"
          description="The folder is there, it just holds no markdown files outside node_modules."
        />
      );
    }

    return (
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(260px,320px)_1fr] gap-6 flex-1 min-h-0 lg:grid-rows-[minmax(0,1fr)]">
        <div className="flex min-h-0 flex-col overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800">
          <div className="flex flex-none items-center gap-1.5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-2.5 py-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
              Documents
            </span>
            <span className="ml-auto text-[11px] tabular-nums text-zinc-400">
              {list.docs.length}
            </span>
          </div>
          {/* The pane scrolls, not the page — the shell owns page scroll. */}
          <div
            data-testid="workspace-doc-list-pane"
            className="min-h-0 flex-1 overflow-y-auto p-1.5"
          >
            <DocTree docs={list.docs} selected={selectedPath} onSelect={setSelectedPath} />
          </div>
        </div>

        <div data-testid="workspace-doc-detail-pane"
          className="min-h-0 min-w-0 overflow-y-auto">
          {selectedPath === null ? (
            <EmptyState
              icon="ti-file-text"
              title="No document selected"
              description="Pick a file on the left to read it."
            />
          ) : detail.isError ? (
            <ErrorState variant="failed" subject={selectedPath} />
          ) : detail.isLoading || detail.markdown === null ? (
            <Skeleton shape="text" label="Loading document…" />
          ) : (
            <article>
              <header className="mb-4 border-b border-zinc-100 dark:border-zinc-800 pb-3.5">
                <h2 className="font-mono text-xs text-zinc-500">{selectedPath}</h2>
              </header>
              {/* Bounded to a reading measure, left-aligned — TASK-1608. */}
              <div className="max-w-[72ch]">
                <CaptureMarkdown>{detail.markdown}</CaptureMarkdown>
              </div>
            </article>
          )}
        </div>
      </div>
    );
  }

  return (
    <section aria-label="workspace docs" className="flex min-h-0 flex-1 flex-col">
      <div className="mb-4 flex items-baseline gap-2">
        <h1 className="text-lg font-medium">Workspace docs</h1>
        <span className="text-xs text-zinc-400">markdown · read-only</span>
        {list.cwd && (
          <span className="ml-auto truncate font-mono text-[11px] text-zinc-400">{list.cwd}</span>
        )}
      </div>
      <div className="mb-4">
        <WorkspaceSelect onSubmit={pickWorkspace} />
      </div>
      {body()}
      {health.conn === "stale" && (
        <p className="mt-3 text-xs text-zinc-400">Possibly stale — see the status bar.</p>
      )}
    </section>
  );
}
