// TASK-1173 AC-3 — the Cockpit's only mutations: mark a task READY, start a
// session on the focus task, end the active session. Same shape as SyncActions
// (confirm-gate, mutation, result/error surfaced, refetch on success) — never a
// silent success.

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { endWorkflowSession, markTaskReady, startWorkflowSession, type FocusFeed } from "../api";

export function WorkflowActions({
  feed,
  projectId,
  workspaceId,
  onDone,
}: {
  feed: FocusFeed;
  projectId: string;
  workspaceId: string;
  onDone: () => void;
}): React.JSX.Element {
  const [readyId, setReadyId] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onError = (kind: string) => (e: unknown) =>
    setError(`${kind} failed: ${e instanceof Error ? e.message : String(e)}`);
  const onOk = (msg: string) => () => {
    setResult(msg);
    onDone();
  };

  const ready = useMutation({
    mutationFn: (taskId: string) => markTaskReady(taskId),
    onSuccess: (r) => onOk(`${r.task.id} marked ${r.task.status}.`)(),
    onError: onError("mark-ready"),
  });
  const start = useMutation({
    mutationFn: (taskId: string) => startWorkflowSession(projectId, workspaceId, taskId),
    onSuccess: () => onOk("Session started.")(),
    onError: onError("start-session"),
  });
  const end = useMutation({
    mutationFn: (sessionId: string) => endWorkflowSession(sessionId),
    onSuccess: () => onOk("Session ended.")(),
    onError: onError("end-session"),
  });

  const busy = ready.isPending || start.isPending || end.isPending;
  const activeSession = feed.activeSession;
  const startCandidate = !activeSession ? (feed.next[0] ?? null) : null;

  const runReady = (): void => {
    if (readyId.trim().length === 0) return;
    if (!window.confirm(`Mark ${readyId.trim()} READY?`)) return;
    setResult(null);
    setError(null);
    ready.mutate(readyId.trim());
  };
  const runStart = (taskId: string): void => {
    if (!window.confirm(`Start a session on ${taskId}?`)) return;
    setResult(null);
    setError(null);
    start.mutate(taskId);
  };
  const runEnd = (sessionId: string): void => {
    if (!window.confirm(`End session ${sessionId}?`)) return;
    setResult(null);
    setError(null);
    end.mutate(sessionId);
  };

  return (
    <div className="flex flex-col gap-2" aria-label="workflow actions">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={readyId}
          onChange={(e) => setReadyId(e.target.value)}
          placeholder="TASK-NNN"
          className="px-2 py-1.5 rounded-md text-sm border border-zinc-300 dark:border-zinc-700 bg-transparent"
        />
        <button
          type="button"
          onClick={runReady}
          disabled={busy || readyId.trim().length === 0}
          className="px-3 py-1.5 rounded-md text-sm bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-50"
        >
          Mark ready
        </button>
        {activeSession ? (
          <button
            type="button"
            onClick={() => runEnd(activeSession.id)}
            disabled={busy}
            className="px-3 py-1.5 rounded-md text-sm bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-50"
          >
            End session
          </button>
        ) : (
          startCandidate && (
            <button
              type="button"
              onClick={() => runStart(startCandidate.id)}
              disabled={busy}
              className="px-3 py-1.5 rounded-md text-sm bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-50"
            >
              Start {startCandidate.id}
            </button>
          )
        )}
      </div>
      {result && <span role="status" className="text-sm text-emerald-700 dark:text-emerald-400">{result}</span>}
      {error && <span role="alert" className="text-sm text-rose-700 dark:text-rose-400">{error}</span>}
    </div>
  );
}
