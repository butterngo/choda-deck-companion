import { createContext, useContext, useEffect } from "react";
import { Outlet } from "react-router-dom";
import { TabStrip } from "../components/TabStrip";
import { useLiveQueue } from "../hooks/use-live-queue";
import type { LiveQueueState } from "shared/sse";

const LiveQueueContext = createContext<LiveQueueState | null>(null);

export function useLiveQueueContext(): LiveQueueState {
  const ctx = useContext(LiveQueueContext);
  if (!ctx) throw new Error("useLiveQueueContext must be used within Shell");
  return ctx;
}

/**
 * Browser tab title: `(N) Companion` when active runs > 0 else `Companion`.
 * See docs/handoff-design/project/uploads/01-shell-and-navigation.md §S3.
 */
function useDocumentTitle(activeCount: number) {
  useEffect(() => {
    const base = "Companion";
    document.title = activeCount > 0 ? `(${activeCount}) ${base}` : base;
    return () => {
      document.title = base;
    };
  }, [activeCount]);
}

export function Shell() {
  const { state, sseStatus } = useLiveQueue();
  const activeCount = state.active ? 1 : 0;
  useDocumentTitle(activeCount);
  return (
    <LiveQueueContext.Provider value={state}>
      <TabStrip sseStatus={sseStatus} />
      <main
        id="view"
        className="max-w-page mx-auto px-4 md:px-6 py-4 md:py-6"
        aria-live="polite"
      >
        <Outlet />
      </main>
    </LiveQueueContext.Provider>
  );
}
