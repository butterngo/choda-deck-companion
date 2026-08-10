// TASK-1173 — the Workflow Cockpit: NOW/NEXT/DONE board + inbox triage + light
// actions, over the same single laptop API as the rest of the shell. Honest
// liveness (AC-4): reuses the shell's health context, same disconnected/stale
// treatment as Sync Observatory — never a fake-live board when the API is down.
//
// TASK-1596 — moved onto the shared state components. The disconnected and
// query-failed branches were previously ONE branch sharing one message; they
// are now split, because "the laptop is unreachable" and "the focus query
// failed" are different facts and ADR-028 forbids conflating them.

import { useOutletContext } from "react-router-dom";
import type { HealthView } from "../hooks/use-health";
import { useWorkspace } from "../hooks/use-workspace";
import { useFocus } from "../hooks/use-focus";
import { useInbox } from "../hooks/use-inbox";
import { FocusBoard } from "../components/FocusBoard";
import { InboxTriage } from "../components/InboxTriage";
import { WorkflowActions } from "../components/WorkflowActions";
import { WorkspaceSelect } from "../components/WorkspaceSelect";
import { Skeleton } from "../components/state/Skeleton";
import { ErrorState } from "../components/state/ErrorState";

export function CockpitView(): React.JSX.Element {
  const health = useOutletContext<HealthView>();
  const { workspaceId, setWorkspaceId } = useWorkspace();
  const focus = useFocus(workspaceId);
  const inbox = useInbox(focus.feed?.projectId ?? null);

  const refetchAll = (): void => {
    focus.refetch();
    inbox.refetch();
  };

  function body(): React.JSX.Element {
    if (workspaceId === null) return <WorkspaceSelect onSubmit={setWorkspaceId} />;

    // Unreachable first: when the API is down the board is unavailable, and
    // saying anything more specific would be guessing.
    if (health.conn === "disconnected") {
      return (
        <ErrorState
          variant="unreachable"
          description="The board is unavailable — this is not “nothing to do”."
        />
      );
    }
    // Reachable, but this query failed. Everything else on the shell still works.
    if (focus.isError) {
      return (
        <ErrorState
          variant="failed"
          subject="the focus board"
          action={
            <button
              type="button"
              onClick={refetchAll}
              className="px-3 py-1.5 rounded-md text-sm border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              Try again
            </button>
          }
        />
      );
    }
    if (focus.isLoading || !focus.feed) return <Skeleton shape="card" label="Loading focus board…" />;

    return (
      <>
        <FocusBoard feed={focus.feed} />
        {health.conn === "stale" && (
          <p className="mt-3 text-xs text-zinc-400">Possibly stale — see the status bar.</p>
        )}
        <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-400 mt-6 mb-2">
          Inbox triage
        </h2>
        <InboxTriage items={inbox.items} />
      </>
    );
  }

  return (
    <section aria-label="workflow cockpit" className="flex-1 min-h-0 overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-medium">Workflow Cockpit</h1>
        {focus.feed && (
          <WorkflowActions
            feed={focus.feed}
            projectId={focus.feed.projectId}
            workspaceId={focus.feed.workspaceId}
            onDone={refetchAll}
          />
        )}
      </div>
      {body()}
    </section>
  );
}
