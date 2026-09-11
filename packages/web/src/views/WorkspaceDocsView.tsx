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

import { useEffect, useRef, useState } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import type { HealthView } from "../hooks/use-health";
import { useWorkspaceDoc, useWorkspaceDocs } from "../hooks/use-workspace-docs";
import { useWorkspaceSymbols } from "../hooks/use-workspace-symbols";
import { CaptureMarkdown } from "../components/CaptureMarkdown";
import { FenceEditor } from "../components/FenceEditor";
import { listMermaidFences } from "../lib/mermaid-fences";
import { DocTree } from "../components/DocTree";
import { WorkspaceSelect } from "../components/WorkspaceSelect";
import { ErrorState } from "../components/state/ErrorState";
import { EmptyState } from "../components/state/EmptyState";
import { CapabilityNote } from "../components/state/CapabilityNote";
import { SourceView } from "../components/SourceView";
import { SymbolLookupPanel } from "../components/SymbolLookupPanel";
import { Skeleton } from "../components/state/Skeleton";

// `workspaceId` prop: when the parent already knows which workspace (the
// WorkspaceView tabs), the picker is noise — you cannot be "on" a workspace and
// still be asked which one. Absent, the view keeps its standalone behaviour.
/**
 * Only a .md file goes through the markdown renderer.
 *
 * Exported for the Setup pane (TASK-1831), which faces the same choice for
 * the same reason. A second copy of a one-line predicate is cheap right up
 * until the two disagree about a file type.
 */
export function isMarkdown(path: string): boolean {
  return path.toLowerCase().endsWith(".md");
}

export function WorkspaceDocsView({ workspaceId: fixedId }: { workspaceId?: string } = {}): React.JSX.Element {
  const health = useOutletContext<HealthView>();
  // TASK-1766 — honour ?workspaceId= and ?path=.
  //
  // These were NOT read before, and two callers had been linking with them
  // anyway: TaskProvenance.tsx has deep-linked `?workspaceId=…&path=…` since
  // TASK-1748, and ProjectsView since TASK-1765. Both landed on the picker with
  // the query string silently discarded — a link that looks like it works,
  // arrives at the right route, and quietly does nothing it promised.
  //
  // Used as the INITIAL value only: once here, picking a different workspace
  // must not be fought by the URL on every render.
  const [params] = useSearchParams();
  const [pickedId, setPickedId] = useState<string | null>(
    () => params.get("workspaceId") || null,
  );
  const workspaceId = fixedId ?? pickedId;
  const setWorkspaceId = setPickedId;
  const [selectedPath, setSelectedPath] = useState<string | null>(
    () => params.get("path") || null,
  );
  // TASK-1792 — the line a commit's changed-file link points at. Initial state
  // only, like path: once here, picking another file must not keep dragging the
  // reader back to a line in a file they have left.
  const [initialLine] = useState<number | null>(() => {
    const raw = params.get("line");
    if (raw === null) return null;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  });
  // Read the file on the full pane width.
  //
  // The two-column grid and the 72ch measure are right for prose; they are
  // wrong for a wide mermaid diagram or a long code line, which is exactly
  // where a reader wants the whole window. A toggle rather than a heuristic:
  // the reader knows which of the two they are doing, and a layout that
  // switched itself on some width guess would fight them.
  const [wide, setWide] = useState(false);
  // TASK-1937 — which diagram is open for editing, by fence index. Null is the
  // normal state: the pane stays a reader until someone asks to edit.
  const [editing, setEditing] = useState<number | null>(null);
  // Set only by a press on a diagram, and cleared as soon as it is honoured —
  // a standing "scroll to the editor" flag would drag the reader back there on
  // every unrelated re-render.
  const [jumpToEditor, setJumpToEditor] = useState(false);
  const editorAnchor = useRef<HTMLDivElement | null>(null);
  // A save returns the document it wrote, so the pane can show it without a
  // refetch racing the write it just made.
  const [savedMarkdown, setSavedMarkdown] = useState<{ path: string; text: string; etag: string } | null>(null);
  const list = useWorkspaceDocs(workspaceId);
  const detail = useWorkspaceDoc(workspaceId, selectedPath);

  // TASK-1798 — the symbol a reader clicked, and where it took them.
  //
  // `jump` is separate from the URL's ?line= on purpose: that param describes
  // where the reader ARRIVED from another view, and a symbol jump is a move
  // they made here. Overwriting the param would rewrite their history; reading
  // it as the source of truth would mark the wrong line after the first jump.
  const [pendingSymbol, setPendingSymbol] = useState<string | null>(null);
  const [jump, setJump] = useState<{ path: string; line: number } | null>(null);
  const lookup = useWorkspaceSymbols(workspaceId, pendingSymbol);

  useEffect(() => {
    // Exactly one match navigates, and ONLY one. Zero and several are answers
    // in their own right, rendered by SymbolLookupPanel (TASK-1799) — a wrong
    // jump is indistinguishable from a right one once the reader is looking at
    // the wrong file, so several matches wait for a choice.
    //
    // pendingSymbol is deliberately NOT cleared here any more: the panel needs
    // the name to render every other outcome, and clearing it on success is
    // what stops a stale picker hanging over the file just opened.
    if (!lookup.isResolved || lookup.matches.length !== 1) return;
    const hit = lookup.matches[0]!;
    setSelectedPath(hit.path);
    setJump({ path: hit.path, line: hit.line });
    setPendingSymbol(null);
  }, [lookup.isResolved, lookup.matches]);

  useEffect(() => {
    if (!jumpToEditor) return;
    // Optional-called: jsdom has no layout and does not implement this, and a
    // view that throws in tests is worse than one that does not scroll in them.
    editorAnchor.current?.scrollIntoView?.({ block: "start" });
    setJumpToEditor(false);
  }, [jumpToEditor]);

  /** Chosen from the picker — the same landing as a single match. */
  function openMatch(match: { path: string; line: number }): void {
    setSelectedPath(match.path);
    setJump({ path: match.path, line: match.line });
    setPendingSymbol(null);
  }

  /**
   * Edit pressed on a diagram in the document.
   *
   * The editor stays in ONE place — the Diagrams list at the foot — rather than
   * opening inline where the click happened. Two editors for one fence is a
   * second place for the draft to live, and the editor carries its own preview,
   * so the reader loses nothing by being taken to it. The scroll is what makes
   * that honest: opening an editor a screen below the click, silently, reads as
   * a button that did nothing.
   */
  function openFence(index: number): void {
    setEditing(index);
    setJumpToEditor(true);
  }

  /** Selecting a different file closes the editor: fence 2 of one document is
      not fence 2 of another, and leaving it open would edit the wrong diagram. */
  function openFile(path: string | null): void {
    setSelectedPath(path);
    setEditing(null);
  }

  function pickWorkspace(id: string): void {
    setWorkspaceId(id);
    setSelectedPath(null);
    setEditing(null);
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

    // A save hands back the exact document it wrote, so the pane shows that
    // rather than waiting for a refetch that could race the write.
    const fresh = savedMarkdown !== null && savedMarkdown.path === selectedPath ? savedMarkdown : null;
    const docText = fresh?.text ?? detail.markdown ?? "";
    const docEtag = fresh?.etag ?? detail.etag;
    const fences =
      selectedPath !== null && isMarkdown(selectedPath) ? listMermaidFences(docText) : [];

    return (
      <div
        className={[
          "grid grid-cols-1 gap-6 flex-1 min-h-0 lg:grid-rows-[minmax(0,1fr)]",
          wide ? "" : "lg:grid-cols-[minmax(260px,320px)_1fr]",
        ].join(" ")}
      >
        {/* Hidden, not unmounted — remounting the tree would drop every
            expanded folder, so leaving fullscreen would land the reader on a
            collapsed list instead of where they were. */}
        <div
          className={[
            "flex min-h-0 flex-col overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800",
            wide ? "hidden" : "",
          ].join(" ")}
        >
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
            <DocTree docs={list.docs} selected={selectedPath} onSelect={openFile} />
          </div>
        </div>

        <div data-testid="workspace-doc-detail-pane"
          className="min-h-0 min-w-0 overflow-y-auto">
          {selectedPath === null ? (
            <EmptyState
              icon="ti-file-text"
              title="No file selected"
              description="Pick a file on the left to read it."
            />
          ) : detail.isBinary ? (
            /* TASK-1788 — not an error. The file is there and readable by
               something; it is simply not text, and decoding it would show
               replacement characters that read as a rendering bug. */
            <CapabilityNote icon="ti-file-off">
              <span data-testid="doc-binary">
                <span className="font-medium text-zinc-900 dark:text-zinc-100">
                  This file is not text.
                </span>{" "}
                <span className="font-mono">{selectedPath}</span> is listed so you can see it
                exists, but showing it here would only produce noise.
              </span>
            </CapabilityNote>
          ) : detail.isError ? (
            <ErrorState variant="failed" subject={selectedPath} />
          ) : detail.isLoading || detail.markdown === null ? (
            <Skeleton shape="text" label="Loading file…" />
          ) : (
            <article>
              {/* Sticky within the detail pane, which is the scrolling
                  ancestor. The toggle used to scroll away with the header, so
                  a reader who noticed the 72ch measure was wrong — which only
                  happens once they are DEEP in a document, at the diagram —
                  had to scroll back to the top to widen it. Needs its own
                  background: transparent would let the document render through
                  the header as it passes under. */}
              <header
                data-testid="doc-detail-header"
                className="sticky top-0 z-10 mb-4 flex items-center gap-2 border-b border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 pb-3.5"
              >
                <h2 className="min-w-0 truncate font-mono text-xs text-zinc-500">{selectedPath}</h2>
                <button
                  type="button"
                  data-testid="doc-wide-toggle"
                  aria-pressed={wide}
                  onClick={() => setWide((v) => !v)}
                  title={wide ? "Back to the list" : "Read full width"}
                  className="ml-auto flex flex-none items-center gap-1.5 rounded-md border border-zinc-200 dark:border-zinc-800 px-1.5 py-1 text-[11px] text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                >
                  <i className={wide ? "ti ti-arrows-minimize" : "ti ti-arrows-maximize"} aria-hidden="true" />
                  {wide ? "Exit full width" : "Full width"}
                </button>
              </header>
              {/* TASK-1799 — above the file, not instead of it. Every outcome
                  that is not a jump still leaves the reader on the code they
                  were reading. */}
              <div className="mb-3">
                <SymbolLookupPanel
                  name={lookup.name}
                  matches={lookup.matches}
                  isLoading={lookup.isLoading}
                  isResolved={lookup.isResolved}
                  isError={lookup.isError}
                  routeMissing={lookup.routeMissing}
                  unknownWorkspace={lookup.unknownWorkspace}
                  workspaceLabel={list.label}
                  onPick={openMatch}
                  onDismiss={() => setPendingSymbol(null)}
                />
              </div>
              {isMarkdown(selectedPath) ? (
                /* Bounded to a reading measure, left-aligned — TASK-1608. */
                <div
                  data-testid="doc-markdown-measure"
                  data-wide={wide ? "true" : "false"}
                  className={wide ? "max-w-none" : "max-w-[72ch]"}
                >
                  {/* The Edit button belongs ON the diagram. The list below
                      reaches every fence and is the reason nothing is lost when
                      a picture cannot be identified — but finding it means
                      scrolling to the foot of the document, which is exactly
                      the distance a reader looking at a wrong diagram should
                      not have to travel. */}
                  <CaptureMarkdown
                    diagrams
                    editFence={{ fences, onEdit: openFence }}
                  >
                    {docText}
                  </CaptureMarkdown>

                  {/* TASK-1937 — the diagrams, listed and editable. Below the
                      document rather than replacing it: a reader who came to
                      READ must not have to dismiss an editor to see the file. */}
                  {fences.length > 0 && (
                    <div
                      ref={editorAnchor}
                      data-testid="fence-list"
                      className="not-prose mt-4 flex flex-col gap-2"
                    >
                      <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
                        Diagrams
                      </span>
                      {fences.map((f) =>
                        editing === f.index ? (
                          <FenceEditor
                            key={f.index}
                            workspaceId={workspaceId}
                            rel={selectedPath}
                            markdown={docText}
                            etag={docEtag}
                            fence={f}
                            onSaved={(text, sha256) =>
                              setSavedMarkdown({ path: selectedPath, text, etag: sha256 })
                            }
                            onClose={() => setEditing(null)}
                          />
                        ) : (
                          <button
                            key={f.index}
                            type="button"
                            data-testid={`fence-open-${f.index}`}
                            onClick={() => setEditing(f.index)}
                            className="flex items-center gap-1.5 rounded-md border border-zinc-200 dark:border-zinc-800 px-2 py-1 text-left text-[11px] text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                          >
                            <i className="ti ti-sitemap flex-none text-zinc-400" aria-hidden="true" />
                            Diagram {f.index + 1}
                            <span className="ml-auto tabular-nums text-zinc-400">
                              lines {f.start}–{f.end}
                            </span>
                          </button>
                        )
                      )}
                    </div>
                  )}
                </div>
              ) : (
                /* Source is shown verbatim. Running it through the markdown
                   renderer would eat leading hashes, asterisks and underscores
                   — i.e. quietly corrupt the code it claims to show.
                   TASK-1789 added highlighting on top; SourceView renders the
                   plain text first and colours it once the grammar arrives, so
                   a slow language chunk never blanks the pane. */
                <SourceView
                  path={selectedPath}
                  code={detail.markdown}
                  // Only marks a line while the file the link named is the one
                  // being read. Selecting a different file drops the mark
                  // rather than pointing at line N of something unrelated.
                  //
                  // TASK-1794 — a set of one here. This route still receives a
                  // single ?line=, from TaskProvenance; the commit diff now opens
                  // files inside History instead of sending them here.
                  highlightLines={
                    jump !== null && jump.path === selectedPath
                      ? new Set([jump.line])
                      : selectedPath === params.get("path") && initialLine !== null
                        ? new Set([initialLine])
                        : undefined
                  }
                  // TASK-1798 — this pane knows how to resolve a symbol, so it
                  // offers them. CommitFileView does not and stays read-only.
                  onSymbolClick={setPendingSymbol}
                />
              )}
            </article>
          )}
        </div>
      </div>
    );
  }

  return (
    <section aria-label="workspace docs" className="flex min-h-0 flex-1 flex-col">
      {/* Embedded (fixedId): the parent already shows the workspace name, cwd
          and its own tabs, so a second title and a picker asking which
          workspace would contradict the page you are standing on. */}
      {fixedId === undefined && (
        <>
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
        </>
      )}
      {body()}
      {health.conn === "stale" && (
        <p className="mt-3 text-xs text-zinc-400">Possibly stale — see the status bar.</p>
      )}
    </section>
  );
}
