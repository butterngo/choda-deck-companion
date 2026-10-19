// Task detail for the graph node panel — title, status/priority, blockers,
// labels, and the raw markdown body (Context / Acceptance / …). The caller
// fetches the task via useTask.
//
// TASK-2537 — a "Dịch sang tiếng Việt" button beside the title, so both the
// task page and the graph drawer can show the task in Vietnamese. It calls
// POST /tasks/translate (TASK-2536) only when clicked: opening a task never
// spends money (adr-when-this-project-may-call-a-model §1). The translation
// lives in this component's state only; the task itself stays English.

import { useEffect, useState } from "react";
import { translateTask, TranslateError, type TaskDetail, type TaskTranslation } from "../api";
import { CaptureMarkdown } from "./CaptureMarkdown";

type TranslateState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "translated"; result: TaskTranslation }
  | { kind: "error"; status: number; message: string };

export function TaskDetailPanel({ task }: { task: TaskDetail }): React.JSX.Element {
  const [tr, setTr] = useState<TranslateState>({ kind: "idle" });
  const [showVi, setShowVi] = useState(false);

  // A different task is a different text: never show one task's translation on another.
  useEffect(() => {
    setTr({ kind: "idle" });
    setShowVi(false);
  }, [task.id]);

  async function translate(): Promise<void> {
    if (tr.kind === "translated") {
      setShowVi(true);
      return;
    }
    setTr({ kind: "loading" });
    try {
      const result = await translateTask(task.id);
      setTr({ kind: "translated", result });
      setShowVi(true);
    } catch (err) {
      setTr({
        kind: "error",
        status: err instanceof TranslateError ? err.status : 0,
        message: err instanceof Error ? err.message : "translation failed",
      });
    }
  }

  const vi = showVi && tr.kind === "translated" ? tr.result : null;
  const title = vi ? vi.title : task.title;
  const body = vi ? vi.body : task.body;

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-mono text-xs text-zinc-400">{task.id}</div>
          <div className="font-medium">{title}</div>
        </div>
        {vi ? (
          <button
            type="button"
            onClick={() => setShowVi(false)}
            className="inline-flex items-center gap-2 rounded-md border border-violet-300 dark:border-violet-800 px-2 py-1 text-[11.5px] text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-950/40"
          >
            <i className="ti ti-language" aria-hidden="true" />
            Show original
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void translate()}
            disabled={tr.kind === "loading"}
            aria-busy={tr.kind === "loading"}
            className="inline-flex items-center gap-2 rounded-md border border-violet-300 dark:border-violet-800 px-2 py-1 text-[11.5px] text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-950/40 disabled:opacity-40"
          >
            <i className={`ti ${tr.kind === "loading" ? "ti-loader-2 animate-spin" : "ti-language"}`} aria-hidden="true" />
            {tr.kind === "loading" ? "Translating…" : "Dịch sang tiếng Việt"}
            {tr.kind !== "loading" && tr.kind !== "translated" && (
              <span className="font-mono text-[10px] opacity-80">costs money</span>
            )}
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5">{task.status}</span>
        {task.priority && (
          <span className="rounded bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5">{task.priority}</span>
        )}
        {task.labels.map((l) => (
          <span key={l} className="rounded bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 px-1.5 py-0.5">
            {l}
          </span>
        ))}
      </div>
      {task.blockedBy.length > 0 && (
        <div className="text-xs text-amber-700 dark:text-amber-400">
          Blocked by: {task.blockedBy.join(", ")}
        </div>
      )}
      {vi && (
        <div
          role="status"
          data-testid="translate-status"
          className="flex flex-wrap items-center gap-2 rounded-md bg-violet-50 dark:bg-violet-950/40 px-2.5 py-1.5 text-xs text-violet-700 dark:text-violet-300"
        >
          <i className="ti ti-language" aria-hidden="true" />
          <span>Bản dịch tiếng Việt · Azure AI Foundry</span>
          <span className="text-zinc-500 dark:text-zinc-400">
            {vi.cached ? "cached · " : ""}code, paths and ids kept as is · not saved to the task
          </span>
        </div>
      )}
      {tr.kind === "error" && (
        <div role="alert" className="rounded-md bg-rose-50 dark:bg-rose-950/40 px-2.5 py-1.5 text-xs text-rose-700 dark:text-rose-400">
          {tr.status === 501 ? (
            <>
              Azure AI Foundry is not set up. Add the endpoint and key in{" "}
              <a href="#/secrets" className="underline">
                Secrets
              </a>
              , then try again.
            </>
          ) : (
            <>Could not translate: {tr.message}</>
          )}
        </div>
      )}
      {/* TASK-1569 — was a raw <pre>, which showed a captured task body's
          markdown as literal text. Rendered now, with artifact refs resolved. */}
      {body && (
        <div className="rounded-md bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-2 text-xs leading-relaxed">
          <CaptureMarkdown>{body}</CaptureMarkdown>
        </div>
      )}
    </div>
  );
}
