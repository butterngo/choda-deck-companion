// TASK-1783 — the payoff of the audit view: standing at one commit and seeing
// the chain back. What it changed, which task it served, which ADRs decided
// that task, and therefore why the change exists.
//
// Two absences are rendered rather than left blank, because a blank section and
// a section whose content failed to load look identical:
//
//   A commit with no TASK-id says so. It is not an error — about 45% of real
//   history carries no id — and it is not an empty ADR list either, which would
//   imply no ADR applies rather than that nobody recorded which task this was.
//
//   A commit that is `unreachable` says so. It is readable here only because
//   the pre-squash object survives until gc; on a fresh clone it would not
//   exist at all (TASK-1784).

import { Link } from "react-router-dom";
import type { WorkspaceCommitDetail } from "../api";
import type { Origin } from "../lib/origin";
import { useTask } from "../hooks/use-task";
import { FileDiff } from "./FileDiff";
import { Skeleton } from "./state/Skeleton";
import { CapabilityNote } from "./state/CapabilityNote";

function SectionLabel({
  children,
  count,
}: {
  children: React.ReactNode;
  count?: number;
}): React.JSX.Element {
  return (
    <div className="flex items-baseline gap-2 pb-2">
      <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
        {children}
      </span>
      {count !== undefined && <span className="text-xs tabular-nums text-zinc-400">{count}</span>}
    </div>
  );
}

/**
 * The task a commit names, and the ADRs behind that task.
 *
 * One request per task id, through the same `GET /tasks/:id` the task detail
 * page uses. That call used to take ~15 seconds and is now ~19 ms (TASK-1785),
 * which is what makes a per-panel fetch the right shape here.
 */
function TaskChain({ taskId, origin }: { taskId: string; origin: Origin }): React.JSX.Element {
  const task = useTask(taskId);

  if (task.isLoading) return <Skeleton shape="list" label="Loading task…" />;
  if (task.isError || task.task === null) {
    return (
      <CapabilityNote icon="ti-help-circle">
        <span data-testid={`commit-task-unresolved-${taskId}`}>
          The commit names <span className="font-mono">{taskId}</span>, but that task could not be
          read. The id is in the subject; the record behind it is not available.
        </span>
      </CapabilityNote>
    );
  }

  const adrs = task.task.adrs ?? [];
  return (
    <div className="flex flex-col gap-4">
      <section>
        <SectionLabel>Task</SectionLabel>
        <div className="rounded-md border border-zinc-200 dark:border-zinc-800 px-2.5 py-2">
          <Link
            to={`/tasks/${encodeURIComponent(taskId)}`}
            // TASK-1793 — carry the way back. A reader who followed
            // commit -> task and then found only "Projects" has lost the
            // commit list they were auditing.
            state={{ from: origin }}
            data-testid={`commit-task-link-${taskId}`}
            className="font-mono text-[11.5px]"
          >
            {taskId}
          </Link>
          <p data-testid={`commit-task-title-${taskId}`} className="mt-0.5 text-sm">
            {task.task.title}
          </p>
        </div>
      </section>

      <section>
        <SectionLabel count={adrs.length}>Decided by</SectionLabel>
        {adrs.length === 0 ? (
          <p data-testid={`commit-no-adrs-${taskId}`} className="text-xs text-zinc-500">
            No ADR names this task.
          </p>
        ) : (
          <div className="rounded-md border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-200 dark:divide-zinc-800">
            {adrs.map((a) => (
              <div key={a.slug} className="flex items-center gap-2.5 px-2.5 py-2">
                <a
                  href={`#/knowledge?slug=${encodeURIComponent(a.slug)}`}
                  className="flex-none font-mono text-xs"
                >
                  {a.slug}
                </a>
                <span className="min-w-0 truncate text-xs">{a.title}</span>
                {/* Frontmatter is a declaration; prose is an inference. Only one
                    is the ADR asserting the link itself, so they must not look
                    alike — same rule as TaskProvenance. */}
                <span
                  data-testid={`commit-adr-via-${a.via}`}
                  title={
                    a.via === "frontmatter"
                      ? "This ADR names the task in its frontmatter."
                      : "This ADR mentions the task in its text, not its frontmatter."
                  }
                  className={[
                    "ml-auto flex-none rounded px-1.5 py-px text-[11px] text-zinc-400",
                    a.via === "frontmatter"
                      ? "border border-zinc-200 dark:border-zinc-800"
                      : "border border-dashed border-zinc-300 dark:border-zinc-700",
                  ].join(" ")}
                >
                  {a.via === "frontmatter" ? "declared" : "mentioned"}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export function CommitDetailPanel({
  commit,
  workspaceId,
  origin,
}: {
  commit: WorkspaceCommitDetail;
  /** TASK-1792 — needed so a changed file can link back into the tree. */
  workspaceId: string;
  /**
   * TASK-1793 — where the task link should send the reader BACK to. Required,
   * not optional: the optional version of this prop is why the History tab
   * shipped with no way back at all.
   */
  origin: Origin;
}): React.JSX.Element {
  return (
    <div data-testid="commit-detail" className="flex flex-col gap-4">
      <header>
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-xs text-zinc-500">{commit.shortSha}</span>
          <span className="text-[11px] text-zinc-400">{commit.authorDate.slice(0, 10)}</span>
          {commit.reachability === "unreachable" && (
            <span
              data-testid="commit-unreachable"
              title="This commit is readable here only because the object survives until git gc. On a fresh clone it would not exist."
              className="ml-auto flex-none rounded border border-dashed border-amber-400 dark:border-amber-700 px-1.5 py-px text-[11px] text-amber-700 dark:text-amber-400"
            >
              no longer on any branch
            </span>
          )}
          {commit.reachability === "branch-only" && (
            <span
              data-testid="commit-branch-only"
              className="ml-auto flex-none rounded border border-zinc-200 dark:border-zinc-800 px-1.5 py-px text-[11px] text-zinc-400"
            >
              on a branch, not merged
            </span>
          )}
        </div>
        <p className="mt-1 text-sm font-medium">{commit.subject}</p>
        {commit.body !== "" && (
          <p
            data-testid="commit-body"
            className="mt-1.5 whitespace-pre-wrap text-xs text-zinc-600 dark:text-zinc-300"
          >
            {commit.body}
          </p>
        )}
      </header>

      <section>
        <SectionLabel count={commit.files.length}>Files changed</SectionLabel>
        {commit.files.length === 0 ? (
          <div className="rounded-md border border-zinc-200 dark:border-zinc-800 px-2.5 py-4 text-center text-xs text-zinc-600 dark:text-zinc-300">
            Changed no files
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {commit.files.map((f) => (
              <FileDiff key={f.path} file={f} workspaceId={workspaceId} />
            ))}
          </div>
        )}
      </section>

      {commit.taskIds.length === 0 ? (
        <CapabilityNote icon="ti-help-circle">
          <span data-testid="commit-no-task">
            <span className="font-medium text-zinc-900 dark:text-zinc-100">
              No task is recorded for this commit.
            </span>{" "}
            Its subject carries no TASK-id, which is true of roughly 45% of this history — mostly
            releases and work from before the tagging habit. The change above is still complete.
          </span>
        </CapabilityNote>
      ) : (
        commit.taskIds.map((id) => <TaskChain key={id} taskId={id} origin={origin} />)
      )}
    </div>
  );
}
