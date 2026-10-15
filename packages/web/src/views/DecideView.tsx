// TASK-2381 — "Needs your decision" (TASK-2404: was "Cần anh quyết"): everything an automated source filed that is
// still waiting on Butter, in one place, with the decision next to it.
//
// Why it exists: in three weeks the daily digest filed 15 ideas into a raw
// inbox of 417 items and 13 of them were never seen — the companion had no
// inbox screen at all (2026-10-11). Butter's requirement for this screen is
// that daily-digest items be the most visible thing in the app, so they come
// FIRST, as their own block, above everything else; the screen is also the
// first sidebar entry and the landing page when something is pending.

import { useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import type { AttentionSession, PendingItem } from "../api";
import type { HealthView } from "../hooks/use-health";
import { usePending, usePendingActions } from "../hooks/use-pending";
import { useAttention } from "../hooks/use-attention";
import { ErrorState } from "../components/state/ErrorState";
import { EmptyState } from "../components/state/EmptyState";
import { Skeleton } from "../components/state/Skeleton";

const btn =
  "rounded-md border border-zinc-200 dark:border-zinc-700 px-2.5 py-1 text-[12.5px] hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50";

function Row({ item }: { item: PendingItem }): React.JSX.Element {
  const actions = usePendingActions();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const error = (actions.convert.error ?? actions.archive.error) as Error | null;

  return (
    <li
      data-testid={`decide-item-${item.id}`}
      className="rounded-md border border-zinc-200 dark:border-zinc-800 px-3 py-2.5"
    >
      <details>
        <summary className="cursor-pointer text-sm font-medium">{item.title || item.id}</summary>
        <p className="mt-1.5 whitespace-pre-wrap text-[12.5px] text-zinc-600 dark:text-zinc-300">
          {item.content}
        </p>
      </details>
      <p className="mt-1 text-[11px] text-zinc-400">
        {item.id} · {item.createdAt.slice(0, 10)}
        {item.workspaceId ? ` · ${item.workspaceId}` : ""}
      </p>
      {created ? (
        <p role="status" className="mt-2 text-[12.5px] text-emerald-700 dark:text-emerald-400">
          Created{" "}
          <Link to={`/tasks/${encodeURIComponent(created)}`} className="underline">
            {created}
          </Link>
        </p>
      ) : rejecting ? (
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            data-testid={`decide-reason-${item.id}`}
            aria-label="Reason to dismiss"
            placeholder="Reason to dismiss"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="min-w-0 flex-1 rounded-md border border-zinc-200 dark:border-zinc-700 bg-transparent px-2 py-1 text-[12.5px]"
          />
          <span className="flex gap-2">
            <button
              type="button"
              data-testid={`decide-archive-save-${item.id}`}
              className={btn}
              disabled={reason.trim() === "" || actions.archive.isPending}
              onClick={() => actions.archive.mutate({ id: item.id, reason: reason.trim() })}
            >
              Save
            </button>
            <button type="button" className={btn} onClick={() => setRejecting(false)}>
              Cancel
            </button>
          </span>
        </div>
      ) : (
        <div className="mt-2 flex gap-2">
          {/* A loop notice is a report to read and dismiss, never a proposal: the
              adapter answers 400 to converting one (TASK-2417), so no button. */}
          {item.source !== "loop" && (
            <button
              type="button"
              data-testid={`decide-convert-${item.id}`}
              className={btn}
              disabled={actions.convert.isPending}
              onClick={() =>
                actions.convert.mutate(item.id, { onSuccess: (r) => setCreated(r.taskId) })
              }
            >
              Approve → task
            </button>
          )}
          <button
            type="button"
            data-testid={`decide-archive-${item.id}`}
            className={btn}
            disabled={actions.archive.isPending}
            onClick={() => {
              // A loop notice was only read, not rejected, so there is no reason to
              // ask for; the adapter still requires one, so "read" is sent for it.
              if (item.source === "loop") {
                actions.archive.mutate({ id: item.id, reason: "read" });
                return;
              }
              setRejecting(true);
              setReason("");
            }}
          >
            Dismiss
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-[12px] text-red-600">
          {error.message}
        </p>
      )}
    </li>
  );
}

/** What each loop notice's leading emoji means — the same scale /choda-autopilot files with. */
const LOOP_LEGEND: [string, string][] = [
  ["🔴", "blocked or refused — something failed and needs you"],
  ["🟡", "needs a decision — missing criteria or a contract gap"],
  ["🟢", "PR ready — waiting for you to merge"],
  ["⚪", "for information — a run started or finished"],
];

function Block({
  id,
  title,
  hint,
  items,
  emphasis = false,
  legend,
}: {
  id: string;
  title: string;
  hint: string;
  items: PendingItem[];
  emphasis?: boolean;
  legend?: [string, string][];
}): React.JSX.Element | null {
  if (items.length === 0) return null;
  return (
    <section
      data-testid={id}
      className={
        emphasis
          ? "rounded-lg border-2 border-blue-500/60 bg-blue-50/40 dark:bg-blue-950/20 p-3"
          : ""
      }
    >
      <h2 className="mb-0.5 text-sm font-medium">
        {title} <span className="ml-1 text-zinc-400 tabular-nums">{items.length}</span>
      </h2>
      <p className="mb-2 text-[11.5px] text-zinc-500">{hint}</p>
      {legend && (
        <dl
          data-testid={`${id}-legend`}
          className="mb-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11.5px] text-zinc-500"
        >
          {legend.map(([mark, meaning]) => (
            <div key={mark} className="contents">
              <dt aria-hidden="true">{mark}</dt>
              <dd>{meaning}</dd>
            </div>
          ))}
        </dl>
      )}
      <ul className="space-y-2">
        {items.map((i) => (
          <Row key={i.id} item={i} />
        ))}
      </ul>
    </section>
  );
}

function age(since: string, now: number): string {
  const min = Math.max(0, Math.round((now - Date.parse(since)) / 60_000));
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`;
}

/**
 * TASK-2384 — Claude sessions waiting on Butter (INBOX-2108), right under the
 * digest block: it is the other thing that is waiting on HIM, not on a tool.
 */
function Sessions({ sessions }: { sessions: AttentionSession[] }): React.JSX.Element | null {
  if (sessions.length === 0) return null;
  const now = Date.now();
  return (
    <section data-testid="decide-block-sessions">
      <h2 className="mb-0.5 text-sm font-medium">
        Waiting on you <span className="ml-1 text-zinc-400 tabular-nums">{sessions.length}</span>
      </h2>
      <p className="mb-2 text-[11.5px] text-zinc-500">Claude Code sessions that finished a turn or are waiting for your permission or answer.</p>
      <ul className="space-y-1.5">
        {sessions.map((s) => (
          <li
            key={s.sessionId}
            data-testid={`decide-session-${s.sessionId}`}
            className="flex items-baseline gap-2 rounded-md border border-zinc-200 dark:border-zinc-800 px-3 py-2 text-[12.5px]"
          >
            <i
              className={`ti ${s.state === "waiting" ? "ti-hand-stop text-amber-600" : "ti-circle-check text-emerald-600"}`}
              aria-hidden="true"
            />
            <span className="font-medium">{s.workspaceId ?? (s.cwd.split(/[\\/]/).pop() || s.cwd)}</span>
            <span className="text-zinc-500">
              {s.state === "waiting" ? "waiting for permission / answer" : "turn finished"} {age(s.since, now)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function DecideView(): React.JSX.Element {
  const health = useOutletContext<HealthView>();
  const { items, isLoading, isError } = usePending();
  const { sessions } = useAttention();

  function body(): React.JSX.Element {
    if (health.conn === "disconnected") {
      return (
        <ErrorState
          variant="unreachable"
          description="Couldn't read the list — this is not 'nothing waiting'."
        />
      );
    }
    if (isError) return <ErrorState variant="failed" subject="the pending items" />;
    if (isLoading) return <Skeleton shape="list" label="Loading…" />;
    if (items.length === 0 && sessions.length === 0) {
      return (
        <EmptyState
          icon="ti-circle-check"
          title="Nothing waiting on you"
          description="This screen shows what the daily digest and the improve loop filed to the inbox that nobody has decided yet."
        />
      );
    }
    const digest = items.filter((i) => i.source === "activity-digest");
    const improve = items.filter((i) => i.source === "improve");
    const notes = items.filter((i) => i.source === "improve-note");
    const loops = items.filter((i) => i.source === "loop");
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto pb-6">
        <Block
          id="decide-block-digest"
          title="From the daily digest"
          hint="Ideas for how you work, drawn from your own activity."
          items={digest}
          emphasis
        />
        <Sessions sessions={sessions} />
        <Block
          id="decide-block-loops"
          title="From your loops"
          hint="Blocked items, decisions and ready PRs reported by /choda-autopilot and /choda-burn-backlog. Dismiss once read."
          items={loops}
          legend={LOOP_LEGEND}
        />
        <Block
          id="decide-block-improve"
          title="Improvement proposals"
          hint="App fixes the improve loop proposes, with evidence and a way to check them."
          items={[...improve].sort((a, b) => (a.workspaceId ?? "").localeCompare(b.workspaceId ?? ""))}
        />
        <Block
          id="decide-block-notes"
          title="Notes"
          hint="Notices and questions from the improve loop."
          items={notes}
        />
      </div>
    );
  }

  return (
    <section aria-label="decide" className="flex min-h-0 flex-1 flex-col">
      <div className="mb-4 flex items-baseline gap-2">
        <h1 className="text-lg font-medium">Needs your decision</h1>
        <span className="text-xs text-zinc-400">what automated tools filed and is waiting on you</span>
      </div>
      {body()}
    </section>
  );
}
