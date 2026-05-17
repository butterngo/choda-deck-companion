import { useEffect, useRef, useState } from "react";
import { applySseEvent, initialLiveQueueState, type LiveQueueState } from "shared/sse";
import type { SseStatusValue } from "../components/SseStatus";

/**
 * Subscribe to /api/queue/live and reduce events into LiveQueueState.
 * EventSource handles native reconnect (~3s) silently per docs/UI.md.
 */
export function useLiveQueue(): {
  state: LiveQueueState;
  sseStatus: SseStatusValue;
} {
  const [state, setState] = useState<LiveQueueState>(initialLiveQueueState);
  const [sseStatus, setSseStatus] = useState<SseStatusValue>("connecting");
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource("/api/queue/live");
    esRef.current = es;

    const onOpen = () => setSseStatus("open");
    const onError = () => setSseStatus("closed");

    es.addEventListener("open", onOpen);
    es.addEventListener("error", onError);

    es.addEventListener("run.active", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        setState((prev) => applySseEvent(prev, { event: "run.active", data }));
      } catch {
        /* ignore */
      }
    });

    es.addEventListener("tick", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        setState((prev) => applySseEvent(prev, { event: "tick", data }));
      } catch {
        /* ignore */
      }
    });

    return () => {
      es.close();
      esRef.current = null;
    };
  }, []);

  return { state, sseStatus };
}
