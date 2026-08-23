// TASK-1748 — the three questions that currently cost a terminal: which ADR
// decided this task, which files it changed, at which commit.
//
// Two of the answers are dangerous to get wrong in the same way, so both are
// handled here rather than left to the caller:
//
//   A file that no longer exists is NOT rendered as a link. Not a link styled
//   to look dead — no anchor at all. A disabled-looking anchor is still an
//   anchor to a keyboard and a screen reader, and this one points at nothing.
//
//   "We could not determine which files changed" is NOT "changed no files".
//   A task with commits and zero recorded edits had those edits made through a
//   path the file_modified hook cannot see (TASK-1751). Reporting an empty list
//   there would be confidently wrong, which is worse than admitting the gap.
//
// The gap uses CapabilityNote, deliberately not ErrorState: nothing failed and
// the commits below are still complete. Painting it rose would train the eye to
// ignore real errors.

import type { ProvenanceAdr, ProvenanceCommit, ProvenanceFile, FilesConfidence } from "../api";
import { CapabilityNote } from "./state/CapabilityNote";

function SectionLabel({
  children,
  count,
}: {
  children: React.ReactNode;
  count?: number | string;
}): React.JSX.Element {
  return (
    <div className="flex items-baseline gap-2 pb-2">
      <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
        {children}
      </span>
      {count !== undefined && (
        <span className="text-xs tabular-nums text-zinc-400">{count}</span>
      )}
    </div>
  );
}

function Pane({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="rounded-md border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-200 dark:divide-zinc-800 overflow-hidden">
      {children}
    </div>
  );
}

function AdrRow({ adr }: { adr: ProvenanceAdr }): React.JSX.Element {
  const declared = adr.via === "frontmatter";
  return (
    <div className="flex items-center gap-2.5 px-2.5 py-2">
      <i className="ti ti-file-text flex-none text-zinc-400" aria-hidden="true" />
      <a href={`#/knowledge?slug=${encodeURIComponent(adr.slug)}`} className="flex-none font-mono text-xs">
        {adr.slug}
      </a>
      <span className="min-w-0 truncate text-xs">{adr.title}</span>
      {/* Frontmatter is a declaration; prose is an inference. Only one of the
          two is the ADR asserting the link itself, so they do not look alike. */}
      <span
        data-testid={`adr-via-${adr.via}`}
        className={[
          "ml-auto flex-none rounded px-1.5 py-px text-[11px] text-zinc-400",
          declared
            ? "border border-zinc-200 dark:border-zinc-800"
            : "border border-dashed border-zinc-300 dark:border-zinc-700",
        ].join(" ")}
        title={
          declared
            ? "This ADR names the task in its frontmatter."
            : "This ADR mentions the task in its text, not its frontmatter."
        }
      >
        {declared ? "declared" : "mentioned"}
      </span>
    </div>
  );
}

function FileRow({ file }: { file: ProvenanceFile }): React.JSX.Element {
  if (!file.exists) {
    return (
      <div
        data-testid="provenance-file-missing"
        className="flex items-center gap-2.5 bg-zinc-50 dark:bg-zinc-900 px-2.5 py-1.5"
      >
        <i className="ti ti-file-off flex-none text-zinc-400/60" aria-hidden="true" />
        {/* No anchor at all — see the note at the top of this file. */}
        <span className="min-w-0 truncate font-mono text-xs text-zinc-400 line-through">
          {file.path}
        </span>
        <span className="ml-auto flex-none rounded border border-zinc-200 dark:border-zinc-800 px-1.5 py-px text-[11px] text-zinc-400">
          no longer on disk
        </span>
        <span className="w-36 flex-none truncate text-right text-[11px] text-zinc-400">
          {file.workspaceId ?? "unknown workspace"}
        </span>
      </div>
    );
  }

  return (
    <div data-testid="provenance-file" className="flex items-center gap-2.5 px-2.5 py-1.5">
      <i className="ti ti-file flex-none text-zinc-400" aria-hidden="true" />
      <a
        href={`#/workspace-docs?workspaceId=${encodeURIComponent(file.workspaceId ?? "")}&path=${encodeURIComponent(file.path)}`}
        className="min-w-0 truncate font-mono text-xs"
      >
        {file.path}
      </a>
      <span className="ml-auto flex-none rounded bg-zinc-100 dark:bg-zinc-800 px-1.5 py-px text-[11px] text-zinc-600 dark:text-zinc-300">
        {file.relation}
      </span>
      <span className="w-36 flex-none truncate text-right text-[11px] text-zinc-400">
        {file.workspaceId ?? "unknown workspace"}
      </span>
    </div>
  );
}

function CommitRow({ commit }: { commit: ProvenanceCommit }): React.JSX.Element {
  return (
    <div className="flex items-center gap-2.5 px-2.5 py-1.5">
      <span className="w-16 flex-none font-mono text-xs">{commit.sha}</span>
      <span className="min-w-0 truncate text-xs">{commit.subject}</span>
      {/* The repo is the point, not decoration: a short sha alone is ambiguous
          across the four workspaces this project spans, and reading it against
          the wrong repo is how TASK-1747 went unnoticed. */}
      <span className="ml-auto flex-none flex items-center gap-1 text-[11px] text-zinc-400">
        <i className="ti ti-git-branch" aria-hidden="true" />
        {commit.workspaceId ?? "unknown repo"}
      </span>
    </div>
  );
}

export function TaskProvenance({
  adrs,
  files,
  commits,
  filesConfidence,
}: {
  adrs: ProvenanceAdr[];
  files: ProvenanceFile[];
  commits: ProvenanceCommit[];
  filesConfidence: FilesConfidence;
}): React.JSX.Element | null {
  const undeterminable = filesConfidence === "undeterminable";

  // Nothing recorded at all. The caller decides whether that warrants a whole
  // EmptyState; this component simply has nothing to add to the page.
  if (adrs.length === 0 && files.length === 0 && commits.length === 0) return null;

  return (
    <div data-testid="task-provenance" className="flex flex-col gap-4">
      {adrs.length > 0 && (
        <section>
          <SectionLabel count={adrs.length}>Decided by</SectionLabel>
          <Pane>
            {adrs.map((a) => (
              <AdrRow key={a.slug} adr={a} />
            ))}
          </Pane>
          {adrs.some((a) => a.via === "body") && (
            <p className="pt-1.5 text-[11px] text-zinc-400">
              “Mentioned” means the ADR names this task in its text rather than in its frontmatter.
            </p>
          )}
        </section>
      )}

      <section>
        <SectionLabel count={undeterminable ? "unknown" : files.length}>Files changed</SectionLabel>
        {undeterminable ? (
          <CapabilityNote icon="ti-help-circle">
            <span data-testid="files-undeterminable">
              <span className="font-medium text-zinc-900 dark:text-zinc-100">
                Couldn’t determine which files changed.
              </span>{" "}
              This task has {commits.length} {commits.length === 1 ? "commit" : "commits"} but no
              recorded file edits — the edits were made through a path that isn’t tracked. The
              commits below are still complete.
            </span>
          </CapabilityNote>
        ) : files.length === 0 ? (
          <Pane>
            <div className="px-2.5 py-4 text-center text-xs text-zinc-600 dark:text-zinc-300">
              Changed no files
            </div>
          </Pane>
        ) : (
          <Pane>
            {files.map((f) => (
              <FileRow key={`${f.workspaceId}:${f.path}`} file={f} />
            ))}
          </Pane>
        )}
      </section>

      {commits.length > 0 && (
        <section>
          <SectionLabel count={commits.length}>Commits</SectionLabel>
          <Pane>
            {commits.map((c) => (
              <CommitRow key={`${c.sessionId}:${c.sha}`} commit={c} />
            ))}
          </Pane>
        </section>
      )}
    </div>
  );
}
