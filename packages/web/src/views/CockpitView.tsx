// TASK-1173 — the Workflow Cockpit: NOW/NEXT/DONE board + inbox triage + light
// actions, over the same single laptop API as the rest of the shell. Honest
// liveness (AC-4): reuses the shell's health context, same disconnected/stale
// treatment as Sync Observatory — never a fake-live board when the API is down.

import { useOutletContext } from "react-router-dom";
import type { HealthView } from "../hooks/use-health";
import { useWorkspace } from "../hooks/use-workspace";
import { useFocus } from "../hooks/use-focus";
import { useInbox } from "../hooks/use-inbox";
import { FocusBoard } from "../components/FocusBoard";
import { InboxTriage } from "../components/InboxTriage";
import { WorkflowActions } from "../components/WorkflowActions";
import { WorkspaceSelect } from "../components/WorkspaceSelect";

export function CockpitView(): React.JSX.Element {
  const health = useOutletContext<HealthView>();
  const { workspaceId, setWorkspaceId } = useWorkspace();
  const focus = useFocus(workspaceId);
  const inbox = useInbox(focus.feed?.projectId ?? null);

  const refetchAll = (): void => {
    focus.refetch();
    inbox.refetch();
  };

  return (
    <section aria-label="workflow cockpit">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-lg font-medium">Workflow Cockpit</h1>
        {focus.feed && <WorkflowActions feed={focus.feed} projectId={focus.feed.projectId} workspaceId={focus.feed.workspaceId} onDone={refetchAll} />}
      </div>

      {workspaceId === null ? (
        <WorkspaceSelect onSubmit={setWorkspaceId} />
      ) : health.conn === "disconnected" || focus.isError ? (
        <p role="alert" className="text-sm text-rose-700 dark:text-rose-400">
          Can’t reach the laptop API — the board is unavailable. (Not “nothing to do”.)
        </p>
      ) : focus.isLoading || !focus.feed ? (
        <p className="text-sm text-zinc-500">Loading focus board…</p>
      ) : (
        <>
          <FocusBoard feed={focus.feed} />
          <p className="mt-3 text-xs text-zinc-400">
            {health.conn === "stale" && "Possibly stale — see the status bar."}
          </p>
          <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-400 mt-4 mb-2">Inbox triage</h2>
          <InboxTriage items={inbox.items} />
        </>
      )}
    </section>
  );
}
