// TASK-2550 — the two writes that settle a conversation, from the companion.
//
// The pane's ✕ only closes the reader. A thread actually closes when it has a
// decision and every participant has signed off (the fold behind
// POST /conversations/:id/decide and /signoff). This puts both on an open
// thread: record the decision, and sign off as Butter.
//
// The companion is Butter's own app, so it signs off as OWNER and nobody else.
// The button is absent when Butter is not a participant or has already signed:
// offering to sign for someone else would make a signoff mean nothing.

import { useState } from "react";
import {
  decideConversation,
  signoffConversation,
  type ConversationParticipant,
  type ConversationSummary,
} from "../api";

/** The participant this app signs off as. */
export const OWNER = "Butter";

const btn =
  "rounded-md border border-zinc-200 dark:border-zinc-700 px-2.5 py-1 text-[12.5px] hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50";

export function ConversationActions({
  conversation,
  participants,
  onChanged,
}: {
  conversation: ConversationSummary;
  participants: ConversationParticipant[];
  /** Called after a successful write, so the pane re-reads the thread. */
  onChanged?: () => void;
}): React.JSX.Element | null {
  const [decision, setDecision] = useState("");
  const [pending, setPending] = useState<"decide" | "signoff" | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (conversation.status !== "open") return null;

  // Threads store the owner as either "Butter" or "butter" (TASK-2553), and the
  // fold compares names exactly, so match without case and sign with the
  // participant's own spelling.
  const owner = participants.find((p) => p.name.toLowerCase() === OWNER.toLowerCase())?.name;
  const canSign = owner !== undefined && !conversation.signedOff.includes(owner);

  async function run(kind: "decide" | "signoff", call: () => Promise<unknown>): Promise<void> {
    setPending(kind);
    setError(null);
    try {
      await call();
      if (kind === "decide") setDecision("");
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "the request failed");
    } finally {
      setPending(null);
    }
  }

  return (
    <section
      aria-label="settle this conversation"
      className="mb-5 flex flex-col gap-2 rounded-md border border-zinc-200 dark:border-zinc-800 p-3"
    >
      <label className="text-[11px] font-medium uppercase tracking-wide text-zinc-400" htmlFor={`decision-${conversation.id}`}>
        Record decision
      </label>
      <textarea
        id={`decision-${conversation.id}`}
        value={decision}
        onChange={(e) => setDecision(e.target.value)}
        rows={2}
        placeholder="What was decided"
        className="w-full rounded-md border border-zinc-200 dark:border-zinc-700 bg-transparent px-2 py-1.5 text-[13px]"
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={btn}
          disabled={decision.trim() === "" || pending !== null}
          onClick={() => void run("decide", () => decideConversation(conversation.id, decision.trim()))}
        >
          {pending === "decide" ? "Saving…" : "Save decision"}
        </button>
        {canSign && (
          <button
            type="button"
            className={btn}
            disabled={pending !== null}
            onClick={() => void run("signoff", () => signoffConversation(conversation.id, owner))}
          >
            {pending === "signoff" ? "Signing off…" : `Sign off as ${OWNER}`}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-[12px] text-rose-700 dark:text-rose-400">
          {error}
        </p>
      )}
    </section>
  );
}
