// TASK-1498 — send a captured/pasted image to a NEW conversation via the capture
// bridge (POST /capture). Sibling to CapturePreview's Save/Copy actions; this is
// the "share into the graph" path the extension already had. New-conversation
// only for v1 (reply-to-existing is deferred). Degrades honestly: no project →
// disabled with a reason; disconnected → disabled; over the 5 MB cap → disabled;
// a failed POST surfaces the error and leaves the image in place for retry.

import { useState } from "react";
import { isWithinCaptureCap, MAX_CAPTURE_BYTES } from "../lib/capture";
import { sendImageToConversation } from "../api";

export interface CaptureSendPanelProps {
  dataUrl: string;
  // The project the conversation is opened under. null until a workspace is
  // chosen — send stays disabled rather than POSTing a null project (AC-4).
  projectId: string | null;
  connected: boolean;
}

type SendState =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent"; conversationId: string }
  | { kind: "error"; message: string };

export function CaptureSendPanel({ dataUrl, projectId, connected }: CaptureSendPanelProps): React.JSX.Element {
  const [title, setTitle] = useState("Screen capture");
  const [state, setState] = useState<SendState>({ kind: "idle" });

  const withinCap = isWithinCaptureCap(dataUrl);
  const trimmedTitle = title.trim();
  const canSend =
    connected && projectId !== null && withinCap && trimmedTitle.length > 0 && state.kind !== "sending";

  const send = async (): Promise<void> => {
    if (!canSend || projectId === null) return;
    setState({ kind: "sending" });
    try {
      const res = await sendImageToConversation({ dataUrl, projectId, title: trimmedTitle });
      setState({ kind: "sent", conversationId: res.id });
    } catch (e) {
      // AC-5 — surface the failure; the image stays in the parent's preview so
      // the user can retry, never a silent drop.
      setState({ kind: "error", message: e instanceof Error ? e.message : "send failed" });
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-md border border-zinc-200 dark:border-zinc-800 p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">Send to a conversation</div>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Conversation title"
          aria-label="conversation title"
          className="flex-1 px-2 py-1.5 rounded-md text-sm border border-zinc-300 dark:border-zinc-700 bg-transparent"
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={!canSend}
          className="px-3 py-1.5 rounded-md text-sm bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {state.kind === "sending" ? "Sending…" : "Send"}
        </button>
      </div>

      {!withinCap && (
        <p role="alert" className="text-xs text-rose-700 dark:text-rose-400">
          Image is larger than the {Math.round(MAX_CAPTURE_BYTES / (1024 * 1024))} MB limit — can’t send it to a
          conversation. Save it to disk instead.
        </p>
      )}
      {withinCap && projectId === null && (
        <p className="text-xs text-zinc-500">Pick a workspace (in the Cockpit or Graph tab) to choose where this lands.</p>
      )}
      {withinCap && projectId !== null && !connected && (
        <p className="text-xs text-zinc-500">Adapter unreachable — reconnect to send.</p>
      )}
      {state.kind === "sent" && (
        <p className="text-xs text-emerald-700 dark:text-emerald-400">
          Sent ✓ — opened conversation {state.conversationId}.
        </p>
      )}
      {state.kind === "error" && (
        <p role="alert" className="text-xs text-rose-700 dark:text-rose-400">
          Send failed: {state.message}. The image is still here — try again.
        </p>
      )}
    </div>
  );
}
