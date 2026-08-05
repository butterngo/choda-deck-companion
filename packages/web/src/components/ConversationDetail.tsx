// TASK-1570 — the thread. Message bodies render through CaptureMarkdown, which
// is the whole point: image / network / design / element captures may only target
// conversation or knowledge, so this pane is where half the capture kinds become
// visible for the first time.

import type { ConversationDetail as ConversationDetailData } from "../api";
import { CaptureMarkdown } from "./CaptureMarkdown";

const KIND_STYLE: Record<string, string> = {
  decision: "border-blue-300 dark:border-blue-800",
  signoff: "border-emerald-300 dark:border-emerald-800",
};

export function ConversationDetail({ detail }: { detail: ConversationDetailData }): React.JSX.Element {
  const { conversation, messages, participants } = detail;
  return (
    <div aria-label="conversation detail">
      <div className="flex items-center justify-between gap-2 mb-1">
        <h2 className="text-base font-medium">{conversation.title}</h2>
        <span className="text-xs px-2 py-0.5 rounded bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
          {conversation.status}
        </span>
      </div>
      <p className="text-xs text-zinc-400 mb-3">
        {conversation.id} · {conversation.projectId}
        {participants.length > 0 && ` · ${participants.map((p) => p.name).join(", ")}`}
      </p>

      {conversation.decisionSummary && (
        <p className="mb-3 text-sm rounded bg-blue-50 dark:bg-blue-900/20 p-2">
          <span className="font-medium">Decision: </span>
          {conversation.decisionSummary}
        </p>
      )}

      {messages.length === 0 ? (
        <p className="text-sm text-zinc-500">No messages in this conversation.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {messages.map((m) => (
            <li
              key={m.id}
              className={`rounded border-l-2 pl-3 ${KIND_STYLE[m.kind] ?? "border-zinc-200 dark:border-zinc-800"}`}
            >
              <div className="text-xs text-zinc-400 mb-1">
                {m.authorName}
                {m.kind !== "message" && ` · ${m.kind}`} · {m.createdAt}
              </div>
              {/* Capture markdown lives here — artifact refs resolve to /api/artifacts. */}
              <CaptureMarkdown>{m.content}</CaptureMarkdown>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
