// TASK-1860 — grade a task's acceptance criteria against /choda-plan §3d.
//
// READY is the gate that lets the unattended runner implement, PR and merge. A
// criterion that cannot fail passing that gate means the runner grades its own
// homework. The standard has been written down since /choda-plan; nothing
// applied it except a human remembering to.
//
// Its own component rather than more TaskDetailView, for the reason the pane's
// review control has its own block: this one spends money, and a control that
// costs something should not be buried in a view that does not.

import { useState } from "react";
import {
  AcNothingToGradeError,
  ReviewFailedError,
  ReviewUnavailableError,
  reviewTaskAc,
} from "../api";
import type { AcVerdict } from "../api";
import { CapabilityNote } from "./state/CapabilityNote";

export function AcGrader({ taskId }: { taskId: string }): React.JSX.Element {
  const [verdicts, setVerdicts] = useState<AcVerdict[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [nothing, setNothing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /**
   * Called from ONE place: the button's onClick. Not from an effect, not from a
   * status change, not from opening the task. The adapter makes the boundary
   * structural; this is the half the UI owes.
   */
  async function run(): Promise<void> {
    setBusy(true);
    setError(null);
    setUnavailable(false);
    setNothing(false);
    try {
      setVerdicts(await reviewTaskAc(taskId));
    } catch (err) {
      setVerdicts(null);
      if (err instanceof ReviewUnavailableError) {
        setUnavailable(true);
      } else if (err instanceof AcNothingToGradeError) {
        setNothing(true);
      } else if (err instanceof ReviewFailedError) {
        setError(
          err.kind === "rate_limit"
            ? "The model is rate limited right now. Wait a moment and ask again."
            : err.kind === "network"
              ? "Could not reach the model — check the network rather than the key."
              : err.kind === "budget"
                ? "The model used its whole token budget before answering. Try a smaller model."
                : err.kind === "auth"
                  ? "The configured key was rejected."
                  : `The model call failed (${err.kind}).`,
        );
      } else {
        setError("The model call failed.");
      }
    } finally {
      setBusy(false);
    }
  }

  const weak = verdicts?.filter((v) => v.verdict === "weak") ?? [];

  return (
    <section
      data-testid="ac-grader"
      className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3"
    >
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
          Acceptance criteria
        </span>
        <button
          type="button"
          onClick={() => void run()}
          disabled={busy}
          data-testid="ac-grade"
          className="ml-auto inline-flex items-center gap-2 rounded-md border border-violet-300 dark:border-violet-800 px-2 py-1 text-[11.5px] text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-950/40 disabled:opacity-40"
        >
          {busy ? "Grading…" : "Grade against the standard"}
          <span className="font-mono text-[10px] opacity-80">costs money</span>
        </button>
      </div>

      {unavailable && (
        <div className="mt-3">
          <CapabilityNote icon="ti-sparkles">
            <span data-testid="ac-unconfigured">
              <span className="font-medium text-zinc-900 dark:text-zinc-100">
                No model is configured.
              </span>{" "}
              Set one up and this will check each criterion against the five tests: can it fail,
              does it name where to look, is it one verdict, is it classified, is it tickable.
            </span>
          </CapabilityNote>
        </div>
      )}

      {nothing && (
        <p data-testid="ac-nothing" className="mt-3 text-[11.5px] text-zinc-500">
          This task has no acceptance criteria to grade.
        </p>
      )}

      {error !== null && (
        <p
          data-testid="ac-error"
          className="mt-3 rounded border border-zinc-200 dark:border-zinc-800 px-2 py-1.5 text-[11.5px] text-zinc-600 dark:text-zinc-300"
        >
          {error}
        </p>
      )}

      {verdicts !== null && (
        <div data-testid="ac-verdicts" className="mt-3">
          {/* Deliberately says what it is. A grade is a model's judgement about
              prose, not a check that ran — and a `weak` verdict is worth more
              than an `ok` one, because the grader is discriminating without
              being exhaustive. */}
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-violet-500">
            From the model — judgement, not a check
          </p>
          {verdicts.length === 0 ? (
            <p data-testid="ac-empty" className="text-[11.5px] text-zinc-500">
              The model read them and had nothing to add.
            </p>
          ) : (
            <>
              <p data-testid="ac-summary" className="mb-2 text-[11.5px] text-zinc-500">
                {weak.length === 0
                  ? `${verdicts.length} criteria, none flagged.`
                  : `${weak.length} of ${verdicts.length} flagged.`}
              </p>
              <ul className="space-y-1.5">
                {verdicts.map((v) => (
                  <li
                    key={v.index}
                    data-testid={`ac-verdict-${v.index}`}
                    data-verdict={v.verdict}
                    className={[
                      "rounded border px-2 py-1.5 text-[11.5px]",
                      v.verdict === "weak"
                        ? "border-amber-300 dark:border-amber-800"
                        : "border-zinc-200 dark:border-zinc-800",
                    ].join(" ")}
                  >
                    <span className="flex items-start gap-2">
                      <span
                        className={[
                          "flex-none rounded px-1 font-mono text-[10px] uppercase",
                          v.verdict === "weak"
                            ? "text-amber-700 dark:text-amber-400"
                            : "text-zinc-400",
                        ].join(" ")}
                      >
                        {v.verdict}
                      </span>
                      <span className="min-w-0 flex-1 text-zinc-600 dark:text-zinc-300">
                        {v.text}
                      </span>
                    </span>
                    {v.concern !== null && (
                      <p
                        data-testid={`ac-concern-${v.index}`}
                        className="mt-1 pl-11 text-zinc-500"
                      >
                        {v.concern}
                      </p>
                    )}
                    {v.suggestion !== null && (
                      <p
                        data-testid={`ac-suggestion-${v.index}`}
                        className="mt-1 whitespace-pre-wrap pl-11 font-mono text-[11px] text-zinc-500"
                      >
                        {v.suggestion}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[10.5px] text-zinc-400">
                Suggestions are text to read. Editing a criterion is your call, and the body is
                locked once the task is in progress.
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
