// TASK-1570 — the Conversations pillar. List on the left, thread on the right,
// same layout and liveness treatment as KnowledgeView.
//
// This is the last leg of the capture-visibility chain (TASK-1565): image,
// network, design and element captures may only target conversation or knowledge,
// and the companion's own Capture panel sends screenshots to a *conversation* —
// which, until now, nothing could display.

import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import type { HealthView } from "../hooks/use-health";
import { useConversation, useConversationList } from "../hooks/use-conversations";
import { ConversationList } from "../components/ConversationList";
import { ConversationDetail } from "../components/ConversationDetail";

export function ConversationsView(): React.JSX.Element {
  const health = useOutletContext<HealthView>();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const list = useConversationList();
  const detail = useConversation(selectedId);

  return (
    <section aria-label="conversations">
      <h1 className="text-lg font-medium mb-3">Conversations</h1>

      {health.conn === "disconnected" || list.isError ? (
        <p role="alert" className="text-sm text-rose-700 dark:text-rose-400">
          Can’t reach the laptop API — conversations are unavailable.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            {list.isLoading ? (
              <p className="text-sm text-zinc-500">Loading conversations…</p>
            ) : (
              <ConversationList
                conversations={list.conversations}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            )}
            {health.conn === "stale" && (
              <p className="mt-3 text-xs text-zinc-400">Possibly stale — see the status bar.</p>
            )}
          </div>
          <div>
            {selectedId === null ? (
              <p className="text-sm text-zinc-500">Select a conversation to read it.</p>
            ) : detail.isError ? (
              // A deleted or unknown id must not blank the screen — the adapter
              // answers 404 and this is what the user sees.
              <p role="alert" className="text-sm text-rose-700 dark:text-rose-400">
                Couldn’t load {selectedId} — it may have been deleted.
              </p>
            ) : detail.isLoading || !detail.detail ? (
              <p className="text-sm text-zinc-500">Loading…</p>
            ) : (
              <ConversationDetail detail={detail.detail} />
            )}
          </div>
        </div>
      )}
    </section>
  );
}
