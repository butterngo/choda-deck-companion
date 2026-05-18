import { useEffect, useState } from 'react';
import EventSource from 'react-native-sse';

import type { Auth } from './auth';
import { applySseEvent, initialLiveQueueState } from 'shared/sse';
import type { LiveQueueState, SseTransportStatus } from 'shared/sse';

export type { LiveQueueState, SseTransportStatus } from 'shared/sse';

export function useLiveStatus(auth: Auth | null): { state: LiveQueueState; sseStatus: SseTransportStatus } {
  const [state, setState] = useState<LiveQueueState>(initialLiveQueueState);
  const [sseStatus, setSseStatus] = useState<SseTransportStatus>('idle');

  useEffect(() => {
    if (!auth) {
      setState(initialLiveQueueState);
      setSseStatus('idle');
      return;
    }
    setSseStatus('connecting');

    const es = new EventSource<'run.active' | 'tick'>(`${auth.serverUrl}/api/queue/live`, {
      headers: { Authorization: `Bearer ${auth.token}` },
    });

    es.addEventListener('open', () => setSseStatus('open'));
    es.addEventListener('run.active', (e: any) => {
      try {
        const data = JSON.parse(e.data);
        setState((prev) => applySseEvent(prev, { event: 'run.active', data }));
      } catch {
        // ignore parse errors
      }
    });
    es.addEventListener('tick', (e: any) => {
      try {
        const data = JSON.parse(e.data);
        setState((prev) => applySseEvent(prev, { event: 'tick', data }));
      } catch {
        // ignore parse errors
      }
    });
    es.addEventListener('error', () => {
      setSseStatus('error');
    });

    return () => {
      es.close();
    };
  }, [auth?.serverUrl, auth?.token]);

  return { state, sseStatus };
}
