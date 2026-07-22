// TASK-1174 AC-1/AC-2 — detail view: frontmatter + markdown body + per-ref
// staleness flag straight from the endpoint (isStale / staleness[]).

import Markdown from "react-markdown";
import type { KnowledgeEntry } from "../api";
import { GraphEdgesList } from "./GraphEdgesList";

export function KnowledgeDetail({ entry }: { entry: KnowledgeEntry }): React.JSX.Element {
  return (
    <div aria-label="knowledge detail">
      <div className="flex items-center justify-between gap-2 mb-1">
        <h2 className="text-base font-medium">{entry.frontmatter.title}</h2>
        <span
          role="status"
          className={`text-xs px-2 py-0.5 rounded ${
            entry.isStale
              ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
              : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
          }`}
        >
          {entry.isStale ? "stale" : "fresh"}
        </span>
      </div>
      <p className="text-xs text-zinc-400 mb-3">
        {entry.slug} · {entry.frontmatter.type} · {entry.filePath}
      </p>
      {entry.staleness.length > 0 && (
        <ul className="mb-3 text-xs text-zinc-500">
          {entry.staleness.map((s) => (
            <li key={s.path}>
              {s.path} — {s.commitsSince === 0 ? "up to date" : `${s.commitsSince} commit(s) behind`} ({s.commitSha.slice(0, 7)})
            </li>
          ))}
        </ul>
      )}
      <div className="prose prose-sm dark:prose-invert max-w-none">
        <Markdown>{entry.body}</Markdown>
      </div>
      <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-400 mt-4 mb-2">Linked edges</h3>
      <GraphEdgesList nodeId={entry.slug} />
    </div>
  );
}
