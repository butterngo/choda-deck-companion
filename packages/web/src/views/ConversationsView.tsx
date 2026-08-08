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
import { ErrorState } from "../components/state/ErrorState";

export function ConversationsView(): React.JSX.Element {
  const health = useOutletContext<HealthView>();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const list = useConversationList();
  const detail = useConversation(selectedId);

  return (
    <section aria-label="conversations">
      <h1 className="text-lg font-medium mb-3">Conversations</h1>

      {health.conn === "disconnected" ? (
        // ADR-028 — unreachable is not the same fact as a failed query.
        // A 401 from a token-gated route used to report "Can't reach the
        // laptop API", which sent debugging in the wrong direction.
        <ErrorState variant="unreachable" description="Conversations are unavailable — this is not an empty list." />
      ) : list.isError ? (
        <ErrorState variant="failed" subject="the conversation list" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            {list.isLoading ? (
              <p className="text-sm text-zinc-500">Loading conversations…</p>
            ) : (
              // TASK-1574 — the list scrolls INSIDE this pane instead of growing
              // the page. Unbounded, ~300 conversations made the page ~10,900px
              // tall, so selecting a row near the bottom rendered the detail far
              // above the viewport (measured at top: -3502px) — and because
              // capture images are loading="lazy", they were never even fetched.
              // Bounding the list keeps the screen ~one viewport tall, so the
              // detail is always in view and images load on their own.
              <div
                data-testid="conversation-list-pane"
                className="max-h-[calc(100vh-14rem)] overflow-y-auto pr-1"
              >
                <ConversationList
                  conversations={list.conversations}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                />
              </div>
            )}
            {health.conn === "stale" && (
              <p className="mt-3 text-xs text-zinc-400">Possibly stale — see the status bar.</p>
            )}
          </div>
          {/* The thread scrolls in its own pane too — otherwise a long
              conversation reintroduces the tall page the list fix removed. */}
          <div
            data-testid="conversation-detail-pane"
            className="max-h-[calc(100vh-14rem)] overflow-y-auto"
          >
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
