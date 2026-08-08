// TASK-1174 AC-1/AC-2 — detail view: frontmatter + markdown body + per-ref
// staleness flag straight from the endpoint (isStale / staleness[]).

import type { KnowledgeEntry } from "../api";
import { GraphEdgesList } from "./GraphEdgesList";
import { CaptureMarkdown } from "./CaptureMarkdown";

export function KnowledgeDetail({ entry }: { entry: KnowledgeEntry }): React.JSX.Element {
  return (
    <div aria-label="knowledge detail">
      {/* TASK-1614 — the header was a title fighting a floating badge, over a
          grey line carrying slug · type · the full absolute file path. On a real
          entry that path wrapped to two lines and was the single largest piece
          of noise on screen, at 2.56:1 contrast. */}
      <h2 className="text-[17px] leading-snug font-medium text-balance mb-2">
        {entry.frontmatter.title}
      </h2>
      <div className="flex items-center gap-2 flex-wrap pb-3.5 mb-4 border-b border-zinc-100 dark:border-zinc-800">
        <span className="rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 px-2 py-0.5 text-[11px] font-medium">
          {entry.frontmatter.type}
        </span>
        {/* The badge sits with the other facts about the entry rather than
            floating unattached at the top-right. */}
        <span
          role="status"
          className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
            entry.isStale
              ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
              : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
          }`}
        >
          {entry.isStale ? "stale" : "fresh"}
        </span>
        <span className="mono text-[11.5px] text-zinc-500 truncate max-w-[240px]" title={entry.slug}>
          {entry.slug}
        </span>
        {/* The path is worth having and not worth reading. It moves behind a
            control: full value on hover, copied on click. */}
        <button
          type="button"
          onClick={() => void navigator.clipboard?.writeText(entry.filePath)}
          title={entry.filePath}
          className="ml-auto mono flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 rounded px-1.5 py-0.5"
        >
          <i className="ti ti-copy" aria-hidden="true" />
          Copy path
        </button>
      </div>
      {entry.staleness.length > 0 && (
        <ul className="mb-3 text-xs text-zinc-500">
          {entry.staleness.map((s) => (
            <li key={s.path}>
              {s.path} — {s.commitsSince === 0 ? "up to date" : `${s.commitsSince} commit(s) behind`} ({s.commitSha.slice(0, 7)})
            </li>
          ))}
        </ul>
      )}
      {/* TASK-1569 — capture-aware: an entry created from a screenshot embeds an
          artifacts path that plain react-markdown cannot resolve. */}
      <CaptureMarkdown>{entry.body}</CaptureMarkdown>
      <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-400 mt-4 mb-2">Linked edges</h3>
      <GraphEdgesList nodeId={entry.slug} />
    </div>
  );
}
