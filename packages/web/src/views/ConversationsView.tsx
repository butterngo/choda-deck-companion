// TASK-1570 — the Conversations pillar. List on the left, thread on the right,
// same layout and liveness treatment as KnowledgeView.
//
// This is the last leg of the capture-visibility chain (TASK-1565): image,
// network, design and element captures may only target conversation or knowledge,
// and the companion's own Capture panel sends screenshots to a *conversation* —
// which, until now, nothing could display.
//
// TASK-1617 — same treatment as Knowledge and Vault: the thread is what you
// came for, the list is navigation. It was a 50/50 split with bare <p> states.

import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import type { HealthView } from "../hooks/use-health";
import { useConversation, useConversationList } from "../hooks/use-conversations";
import { ConversationList } from "../components/ConversationList";
import { ConversationDetail } from "../components/ConversationDetail";
import { ErrorState } from "../components/state/ErrorState";
import { EmptyState } from "../components/state/EmptyState";
import { Skeleton } from "../components/state/Skeleton";

export function ConversationsView(): React.JSX.Element {
  const health = useOutletContext<HealthView>();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const list = useConversationList();
  const detail = useConversation(selectedId);

  function body(): React.JSX.Element {
    if (health.conn === "disconnected") {
      // ADR-028 — unreachable is not the same fact as a failed query.
      return (
        <ErrorState
          variant="unreachable"
          description="Conversations are unavailable — this is not an empty list."
        />
      );
    }
    if (list.isError) return <ErrorState variant="failed" subject="the conversation list" />;
    if (list.isLoading) return <Skeleton shape="list" label="Loading conversations…" />;

    return (
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(260px,340px)_1fr] gap-6 flex-1 min-h-0 lg:grid-rows-[minmax(0,1fr)]">
        <ConversationList
          conversations={list.conversations}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />

        {/* The thread scrolls in its own pane — otherwise a long conversation
            reintroduces the tall page TASK-1574 removed. */}
        <div
          data-testid="conversation-detail-pane"
          className="min-w-0 min-h-0 overflow-y-auto"
        >
          {selectedId === null ? (
            <EmptyState
              icon="ti-messages"
              title="No conversation selected"
              description="Pick a thread on the left to read its turns, decision and signoffs."
            />
          ) : detail.isError ? (
            // A deleted or unknown id must not blank the screen — the adapter
            // answers 404 and this is what the user sees.
            <ErrorState
              variant="failed"
              subject={selectedId}
              description="It may have been deleted."
            />
          ) : detail.isLoading || !detail.detail ? (
            <Skeleton shape="text" label="Loading thread…" />
          ) : (
            <ConversationDetail detail={detail.detail} />
          )}
        </div>
      </div>
    );
  }

  return (
    <section aria-label="conversations" className="flex-1 min-h-0 flex flex-col">
      <h1 className="text-lg font-medium mb-4">Conversations</h1>
      {body()}
      {health.conn === "stale" && (
        <p className="mt-3 text-xs text-zinc-400">Possibly stale — see the status bar.</p>
      )}
    </section>
  );
}
