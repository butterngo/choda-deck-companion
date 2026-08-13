// TASK-1570 — the thread. Message bodies render through CaptureMarkdown, which
// is the whole point: image / network / design / element captures may only target
// conversation or knowledge, so this pane is where half the capture kinds become
// visible for the first time.
//
// TASK-1617 — three things the flat version buried.
//
// The DECISION is the answer to the thread, and it was rendering as one more
// paragraph among eleven messages. It now leads, and is labelled.
//
// Every turn carries a `Position:` line, because the etiquette requires one.
// It arrived as the first line of prose, so the single thing you scan a thread
// for was indistinguishable from the argument around it. It is now a badge.
//
// Eleven identically-bordered blocks gave no sense of who said what or how far
// along the thread was. A rail with per-author chips does.

import type { ConversationDetail as ConversationDetailData } from "../api";
import { CaptureMarkdown } from "./CaptureMarkdown";
import { extractPosition, stripPositionLine } from "../lib/conversation-kind";
import { relativeTime } from "../lib/relative-time";

// Positions come from the etiquette: signoff / propose_rewrite /
// abstain_blocked / needs_clarification. Colour encodes "is this settled?"
const POSITION_STYLE: Record<string, string> = {
  signoff: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  needs_clarification: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  propose_rewrite: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  abstain_blocked: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
};

// Stable per-author colour so the same voice looks the same down the thread.
const AUTHOR_COLOURS = [
  "bg-violet-500",
  "bg-sky-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
];

function authorColour(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AUTHOR_COLOURS[h % AUTHOR_COLOURS.length] ?? "bg-zinc-500";
}

function initials(name: string): string {
  const parts = name.trim().split(/[\s_-]+/).filter(Boolean);
  const first = parts[0];
  if (!first) return "?";
  const second = parts[1];
  if (!second) return first.slice(0, 2).toUpperCase();
  return `${first[0]}${second[0]}`.toUpperCase();
}

export function ConversationDetail({
  detail,
  onClose,
}: {
  detail: ConversationDetailData;
  /** Dismisses the thread and returns the pane to its empty state. This closes
   *  the reader, not the conversation — thread status is not writable here. */
  onClose?: () => void;
}): React.JSX.Element {
  const { conversation, messages, participants } = detail;

  return (
    <div aria-label="conversation detail">
      <div className="flex items-start gap-2 mb-2">
        <h2 className="flex-1 min-w-0 text-[17px] leading-snug font-medium text-balance">
          {conversation.title}
        </h2>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close conversation"
            title="Close conversation"
            className="flex-none p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <i className="ti ti-x" aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="flex items-center gap-2 flex-wrap pb-3.5 mb-4 border-b border-zinc-100 dark:border-zinc-800 text-[11.5px] text-zinc-500">
        <span
          className={`rounded-full px-2 py-0.5 font-medium ${
            conversation.status === "open"
              ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
              : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
          }`}
        >
          {conversation.status}
        </span>
        <span className="mono">{conversation.id}</span>
        <span>· {conversation.projectId}</span>
        {participants.length > 0 && <span>· {participants.map((p) => p.name).join(", ")}</span>}
      </div>

      {/* The outcome leads. Reading eleven turns to find out what was decided
          is the failure this fixes. */}
      {conversation.decisionSummary && (
        <div className="mb-6 rounded-md border border-emerald-200 dark:border-emerald-900 border-l-2 border-l-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2.5">
          <div className="flex items-center gap-1.5 mb-1 text-[11px] font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
            <i className="ti ti-check" aria-hidden="true" />
            Decision
          </div>
          <p className="text-[13px] leading-relaxed text-zinc-700 dark:text-zinc-200">
            {conversation.decisionSummary}
          </p>
        </div>
      )}

      {messages.length === 0 ? (
        <p className="text-sm text-zinc-500">No messages in this conversation.</p>
      ) : (
        <ol className="relative flex flex-col gap-6 pl-7" aria-label="turns">
          {/* The rail — turns a stack of blocks into a thread you can follow. */}
          <span
            aria-hidden="true"
            className="absolute left-[9px] top-2 bottom-2 w-px bg-zinc-200 dark:bg-zinc-800"
          />
          {messages.map((m) => {
            const position = extractPosition(m.content);
            const body = position ? stripPositionLine(m.content) : m.content;
            return (
              <li key={m.id} className="relative">
                <span
                  aria-hidden="true"
                  className={`absolute -left-7 top-0 grid place-items-center w-[19px] h-[19px] rounded-full text-[9.5px] font-medium text-white ring-2 ring-white dark:ring-zinc-900 ${authorColour(m.authorName)}`}
                >
                  {initials(m.authorName)}
                </span>
                <div className="flex items-center gap-2 flex-wrap mb-1.5">
                  <span className="text-[12.5px] font-medium text-zinc-800 dark:text-zinc-100">
                    {m.authorName}
                  </span>
                  {position && (
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-[10.5px] font-medium ${
                        POSITION_STYLE[position] ?? "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                      }`}
                    >
                      {position.replace(/_/g, " ")}
                    </span>
                  )}
                  {m.kind !== "message" && (
                    <span className="px-1.5 py-0.5 rounded-full text-[10.5px] bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                      {m.kind}
                    </span>
                  )}
                  <span className="text-[11px] text-zinc-400 tabular-nums" title={m.createdAt}>
                    {relativeTime(m.createdAt) || m.createdAt}
                  </span>
                </div>
                {/* Capture markdown lives here — artifact refs resolve to /api/artifacts. */}
                <CaptureMarkdown>{body}</CaptureMarkdown>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
