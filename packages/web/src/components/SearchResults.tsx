// TASK-1493 — renders cross-project search hits grouped by project, tasks then
// knowledge within each. Pure/presentational so it's unit-testable from a mock;
// the SearchView owns the query + fetch states.

import type { SearchResult, SearchHit } from "../api";

function groupByProject(hits: SearchHit[]): Map<string, SearchHit[]> {
  const m = new Map<string, SearchHit[]>();
  for (const h of hits) {
    const arr = m.get(h.projectId) ?? [];
    arr.push(h);
    m.set(h.projectId, arr);
  }
  return m;
}

export function SearchResults({ result }: { result: SearchResult }): React.JSX.Element {
  const all = [...result.tasks, ...result.knowledge];
  const total = all.length;
  const byProject = groupByProject(all);
  const projects = [...byProject.keys()].sort();

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-zinc-500">
        {total} result{total === 1 ? "" : "s"} across {projects.length} project
        {projects.length === 1 ? "" : "s"} for “{result.query}”.
      </p>

      {!result.knowledgeEnabled && (
        <p role="note" className="text-xs text-amber-700 dark:text-amber-400">
          Knowledge search is degraded{result.knowledgeReason ? ` (${result.knowledgeReason})` : ""} —
          showing task matches only.
        </p>
      )}

      {total === 0 ? (
        <p role="status" className="text-sm text-zinc-500">
          No matches. Try a different term.
        </p>
      ) : (
        projects.map((projectId) => {
          const hits = byProject.get(projectId) ?? [];
          return (
            <section key={projectId} aria-label={`results in ${projectId}`}>
              <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-400 mb-1">
                {projectId}
              </h3>
              <ul className="flex flex-col gap-1">
                {hits.map((h) => (
                  <li
                    key={`${h.kind}-${h.id}`}
                    data-hit
                    className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200"
                  >
                    <span
                      className={`inline-block rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${
                        h.kind === "task"
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                          : "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300"
                      }`}
                    >
                      {h.kind}
                    </span>
                    <span className="font-mono text-xs text-zinc-400">{h.id}</span>
                    <span className="truncate">{h.title}</span>
                    {h.status && <span className="ml-auto text-xs text-zinc-400">{h.status}</span>}
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
