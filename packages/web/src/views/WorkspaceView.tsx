// TASK-1766 — a workspace as a PLACE: its docs and its tasks behind one header,
// with each task leading to the ADR/files/commits behind it.
//
// This is what finally makes /tasks/:id reachable. It shipped in v0.7.0 with no
// inbound link from anywhere in the app, and a packaged Electron window has no
// address bar to type a hash route into — so it was dead code that looked alive
// in the diff, the test run and the release notes (INBOX-1875).
//
// Docs are rendered by WorkspaceDocsView with a fixed workspaceId, not by a
// second doc tree. Two implementations of the same surface would drift, and the
// one nobody is looking at drifts first.
//
// TASK-1782 adds History — the workspace's git log, and the entry point to the
// audit chain (commit → task → ADR). Its failure branch is deliberately checked
// before its empty branch; see historyPane.

import { useState } from "react";
import { Link, useOutletContext, useParams, useSearchParams } from "react-router-dom";
import type { HealthView } from "../hooks/use-health";
import { useWorkspaces } from "../hooks/use-workspaces";
import { useWorkspaceTasks } from "../hooks/use-workspace-tasks";
import { useWorkspaceCommits } from "../hooks/use-workspace-commits";
import { CommitList } from "../components/CommitList";
import { CommitDetailPanel } from "../components/CommitDetailPanel";
import { useWorkspaceCommit } from "../hooks/use-workspace-commit";
import { WorkspaceDocsView } from "./WorkspaceDocsView";
import { ErrorState } from "../components/state/ErrorState";
import { EmptyState } from "../components/state/EmptyState";
import { Skeleton } from "../components/state/Skeleton";

type Tab = "files" | "tasks" | "history";

export function WorkspaceView(): React.JSX.Element {
  const health = useOutletContext<HealthView>();
  const { id } = useParams<{ id: string }>();
  // TASK-1788 follow-up — `?tab=` as INITIAL state only, matching how
  // WorkspaceDocsView reads ?workspaceId= and ?path= (TASK-1766). Read on every
  // render instead, switching tabs by hand would be fought by the URL.
  //
  // This exists because returning from a task landed the reader on Files when
  // they had left from Tasks. The breadcrumb got them back to the right
  // workspace and the wrong pane, which is most of the way to nowhere.
  const [tabParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => {
    const asked = tabParams.get("tab");
    return asked === "tasks" || asked === "history" || asked === "files" ? asked : "files";
  });

  const ws = useWorkspaces();
  const workspace = ws.workspaces.find((w) => w.id === id) ?? null;
  const tasks = useWorkspaceTasks(workspace?.projectId ?? null);
  const commits = useWorkspaceCommits(workspace?.id ?? null);
  const [openSha, setOpenSha] = useState<string | null>(null);
  const openCommit = useWorkspaceCommit(workspace?.id ?? null, openSha);

  function historyPane(): React.JSX.Element {
    // Order matters. The git failure is checked BEFORE the empty branch,
    // because the two are indistinguishable from the commit array alone and
    // only one of them is a fact about the repository (TASK-1779 answers 409
    // rather than 200 + [] for exactly this reason).
    if (commits.gitUnavailable !== null) {
      return (
        <ErrorState
          variant="failed"
          subject="the git history"
          description={`Couldn’t read git in ${commits.gitUnavailable.cwd} — this is not a repository with no commits.`}
        />
      );
    }
    if (commits.isError) return <ErrorState variant="failed" subject="the git history" />;
    if (commits.isLoading) return <Skeleton shape="list" label="Loading history…" />;
    if (commits.commits.length === 0) {
      return (
        <EmptyState
          icon="ti-git-commit"
          title="No commits yet"
          description="git answered, and this repository has no history to show."
        />
      );
    }
    // TASK-1786 — list LEFT, panel RIGHT, matching WorkspaceDocsView's two-pane
    // grid rather than inventing a second layout for the same shape.
    //
    // The panel used to render BELOW the list. With up to 100 rows that put it
    // roughly 90 rows past the fold, so clicking a commit near the top selected
    // the row and appeared to do nothing at all. Every test passed the whole
    // time, because they asserted the panel was in the DOM — which it was. Same
    // "renders but cannot be reached" defect as INBOX-1875 and TASK-1767, at
    // viewport scale instead of route scale, and found the same way: by opening
    // the thing and clicking it.
    //
    // TASK-1792 made it worse by giving the panel a full diff to render, so the
    // one thing nobody could see also became the tallest thing on the page.
    //
    // Each pane scrolls on its own: a long diff must not drag the commit list
    // out of view, and a long list must not bury the diff.
    return (
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(320px,440px)_1fr] lg:grid-rows-[minmax(0,1fr)]">
        <div data-testid="commit-list-pane" className="min-h-0 overflow-y-auto">
          <CommitList
            commits={commits.commits}
            selected={openSha}
            onSelect={(sha) => setOpenSha((prev) => (prev === sha ? null : sha))}
          />
          {commits.hasMore && (
            <p data-testid="commit-has-more" className="mt-2.5 text-[11.5px] text-zinc-500">
              Showing the most recent {commits.commits.length} commits — the log is longer.
            </p>
          )}
        </div>

        <div
          data-testid="commit-detail-pane"
          className="relative min-h-0 overflow-y-auto rounded-md border border-zinc-200 dark:border-zinc-800 p-3"
        >
          {openSha === null ? (
            <p data-testid="commit-detail-idle" className="px-1 py-6 text-center text-xs text-zinc-500">
              Pick a commit on the left to see what it changed.
            </p>
          ) : (
            <>
              {/* Closing used to mean clicking the same sha again, which was
                  itself unreachable while the panel sat below the list. A
                  control that requires finding the thing you came from is not a
                  control. */}
              <button
                type="button"
                onClick={() => setOpenSha(null)}
                data-testid="commit-detail-close"
                aria-label="Close commit detail"
                className="absolute right-2 top-2 rounded-md px-1.5 py-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              >
                <i className="ti ti-x" aria-hidden="true" />
              </button>
              {openCommit.isError ? (
                <ErrorState variant="failed" subject="this commit" />
              ) : openCommit.commit === null ? (
                <Skeleton shape="list" label="Loading commit…" />
              ) : (
                <CommitDetailPanel commit={openCommit.commit} workspaceId={workspace?.id ?? ""} />
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  function tasksPane(): React.JSX.Element {
    if (tasks.isError) return <ErrorState variant="failed" subject="tasks" />;
    if (tasks.isLoading) return <Skeleton shape="list" label="Loading tasks…" />;
    if (tasks.tasks.length === 0) {
      return (
        <EmptyState
          icon="ti-checklist"
          title="No open tasks"
          description="Everything in this project is DONE or CANCELLED."
        />
      );
    }
    return (
      <>
        {/* The scope is stated, never implied. These are the PROJECT's tasks:
            the adapter serves no per-workspace filter and no touches surface,
            so claiming workspace precision here would be a claim we cannot
            back. Under-claiming is the safe direction. */}
        <p data-testid="task-scope-note" className="mb-3 text-[11.5px] text-zinc-500">
          Open tasks across the <span className="font-medium">{workspace?.projectId}</span> project —
          not yet narrowed to this workspace.
        </p>
        <ul data-testid="workspace-task-list" className="space-y-1.5">
          {tasks.tasks.map((t) => (
            <li key={t.id}>
              <Link
                to={`/tasks/${encodeURIComponent(t.id)}`}
                // TASK-1788 — carry the origin so the task page can offer a way
                // back HERE. Without it the breadcrumb can only name a static
                // destination, which is how /tasks/:id ended up sending readers
                // two levels up to Projects.
                state={{
                  from: {
                    to: `/workspaces/${encodeURIComponent(workspace?.id ?? "")}?tab=tasks`,
                    label: workspace?.label ?? "workspace",
                  },
                }}
                data-testid={`workspace-task-${t.id}`}
                className="block rounded-md border border-zinc-200 dark:border-zinc-800 px-3 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
              >
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-[11.5px] text-zinc-400">{t.id}</span>
                  <span className="ml-auto text-[11px] text-zinc-400">{t.status}</span>
                </div>
                <p className="mt-0.5 text-sm">{t.title}</p>
              </Link>
            </li>
          ))}
        </ul>
      </>
    );
  }

  function body(): React.JSX.Element {
    if (health.conn === "disconnected") {
      return (
        <ErrorState
          variant="unreachable"
          description="This workspace is unavailable — this is not an empty workspace."
        />
      );
    }
    if (ws.isError) return <ErrorState variant="failed" subject="workspaces" />;
    if (ws.isLoading) return <Skeleton shape="list" label="Loading workspace…" />;
    if (workspace === null) {
      // A URL naming a workspace that is not registered is a failed lookup, not
      // an empty one — saying "no docs" here would describe a repository that
      // does not exist.
      return (
        <ErrorState
          variant="failed"
          subject={id ?? "workspace"}
          description="No workspace is registered under this id."
        />
      );
    }

    return (
      <>
        <div
          role="tablist"
          aria-label="workspace sections"
          className="mb-4 flex gap-1 border-b border-zinc-200 dark:border-zinc-800"
        >
          {(["files", "tasks", "history"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              data-testid={`workspace-tab-${t}`}
              onClick={() => setTab(t)}
              className={[
                "px-3 py-1.5 text-sm -mb-px border-b-2",
                tab === t
                  ? "border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100 font-medium"
                  : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200",
              ].join(" ")}
            >
              {t === "files" ? "Files" : t === "tasks" ? "Tasks" : "History"}
            </button>
          ))}
        </div>

        {tab === "files" && (
          <div data-testid="workspace-docs-pane" className="flex min-h-0 flex-1 flex-col">
            <WorkspaceDocsView workspaceId={workspace.id} />
          </div>
        )}
        {tab === "tasks" && (
          <div data-testid="workspace-tasks-pane" className="min-h-0 flex-1 overflow-y-auto">
            {tasksPane()}
          </div>
        )}
        {tab === "history" && (
          <div data-testid="workspace-history-pane" className="min-h-0 flex-1 overflow-y-auto">
            {historyPane()}
          </div>
        )}
      </>
    );
  }

  return (
    <section aria-label="workspace" className="flex min-h-0 flex-1 flex-col">
      <div className="mb-4">
        <div className="flex items-baseline gap-2">
          <Link to="/projects" className="text-xs text-zinc-500 hover:underline">
            Projects
          </Link>
          <span className="text-xs text-zinc-300 dark:text-zinc-600">/</span>
          <h1 className="text-lg font-medium">{workspace?.label ?? id}</h1>
        </div>
        {workspace && (
          <p className="mt-1 font-mono text-[11.5px] text-zinc-500">{workspace.cwd}</p>
        )}
      </div>
      {body()}
      {health.conn === "stale" && (
        <p className="mt-3 text-xs text-zinc-400">Possibly stale — see the status bar.</p>
      )}
    </section>
  );
}
