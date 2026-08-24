// TASK-1765 — the entry point the app never had. Until now nothing enumerated
// projects, so there was no way in to a workspace, and therefore no way to
// reach the workspace-docs and task-detail surfaces that shipped in v0.7.0
// (INBOX-1875: both were dead code with no inbound link).
//
// Two panes, same shape as VaultView: pick a project on the left, see its
// workspaces on the right. Deliberately NOT a tree — a project's workspaces are
// a short list, and a tree would hide them behind a disclosure for no gain.

import { useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import type { HealthView } from "../hooks/use-health";
import { useProjects } from "../hooks/use-projects";
import { ErrorState } from "../components/state/ErrorState";
import { EmptyState } from "../components/state/EmptyState";
import { Skeleton } from "../components/state/Skeleton";

export function ProjectsView(): React.JSX.Element {
  const health = useOutletContext<HealthView>();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const list = useProjects();

  const selected = list.projects.find((p) => p.id === selectedId) ?? null;

  function workspacePane(): React.JSX.Element {
    if (selected === null) {
      return (
        <EmptyState
          icon="ti-folders"
          title="No project selected"
          description="Pick a project on the left to see its workspaces."
        />
      );
    }
    const workspaces = list.workspacesOf(selected.id);
    if (workspaces.length === 0) {
      // A project with no workspaces is a real, legitimate state — it means
      // nothing has been registered against it yet, not that a fetch failed.
      return (
        <EmptyState
          icon="ti-folder-off"
          title="No workspaces registered"
          description={`${selected.name} has no workspaces yet. Register one with workspace_add.`}
        />
      );
    }
    return (
      <ul data-testid="workspace-list" className="space-y-1.5">
        {workspaces.map((w) => (
          <li key={w.id}>
            <Link
              to={`/workspaces/${encodeURIComponent(w.id)}`}
              data-testid={`workspace-row-${w.id}`}
              className="block rounded-md border border-zinc-200 dark:border-zinc-800 px-3 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
            >
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-medium">{w.label}</span>
                {/* An archived workspace is shown, never hidden — but it must
                    not read as live. Dropping it would silently misreport what
                    is registered. */}
                {w.archivedAt !== null && (
                  <span
                    data-testid={`workspace-archived-${w.id}`}
                    className="rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 px-2 py-0.5 text-[11px] font-medium"
                  >
                    archived
                  </span>
                )}
                <span className="ml-auto text-[11.5px] text-zinc-400 font-mono">{w.id}</span>
              </div>
              <p className="mt-1 text-[11.5px] text-zinc-500 font-mono truncate">{w.cwd}</p>
            </Link>
          </li>
        ))}
      </ul>
    );
  }

  function body(): React.JSX.Element {
    if (health.conn === "disconnected") {
      // Unreachable and empty are different facts (the TASK-1597 rule). A blank
      // project list on a dead adapter previously looked like "no projects".
      return (
        <ErrorState
          variant="unreachable"
          description="Projects are unavailable — this is not an empty workspace list."
        />
      );
    }
    if (list.isError) {
      return <ErrorState variant="failed" subject="projects" />;
    }
    if (list.isLoading) return <Skeleton shape="list" label="Loading projects…" />;
    if (list.projects.length === 0) {
      return (
        <EmptyState
          icon="ti-folders"
          title="No projects found"
          description="Nothing is registered in this database yet."
        />
      );
    }

    return (
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(260px,340px)_1fr] gap-6 flex-1 min-h-0 lg:grid-rows-[minmax(0,1fr)]">
        <ul data-testid="project-list" className="min-h-0 overflow-y-auto space-y-1">
          {list.projects.map((p) => {
            const active = p.id === selectedId;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(p.id)}
                  data-testid={`project-row-${p.id}`}
                  aria-current={active ? "true" : undefined}
                  className={[
                    "w-full text-left rounded-md px-3 py-2",
                    active
                      ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                      : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50",
                  ].join(" ")}
                >
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-medium">{p.name}</span>
                    <span className="ml-auto text-[11.5px] tabular-nums text-zinc-400">
                      {list.liveCountOf(p.id)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11.5px] text-zinc-500 font-mono truncate">{p.cwd}</p>
                </button>
              </li>
            );
          })}
        </ul>

        <div data-testid="project-detail-pane" className="min-w-0 min-h-0 overflow-y-auto">
          {selected !== null && (
            <header className="pb-3.5 mb-4 border-b border-zinc-100 dark:border-zinc-800">
              <h2 className="text-[17px] leading-snug font-medium">{selected.name}</h2>
              <p className="mt-1 text-[11.5px] text-zinc-500 font-mono">{selected.cwd}</p>
            </header>
          )}
          {workspacePane()}
        </div>
      </div>
    );
  }

  return (
    <section aria-label="projects" className="flex-1 min-h-0 flex flex-col">
      <div className="flex items-baseline gap-2 mb-4">
        <h1 className="text-lg font-medium">Projects</h1>
        <span className="text-xs text-zinc-400">pick a project, then a workspace</span>
      </div>
      {body()}
      {health.conn === "stale" && (
        <p className="mt-3 text-xs text-zinc-400">Possibly stale — see the status bar.</p>
      )}
    </section>
  );
}
