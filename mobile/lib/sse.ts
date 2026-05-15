import { useEffect, useState } from 'react';
import EventSource from 'react-native-sse';

import type { Auth } from './auth';

export type ActiveRun = { queueRunId: string; taskCount: number; startedAt: string };

export type LiveStatus =
  | { status: 'idle' }
  | { status: 'connecting' }
  | { status: 'open'; active: null }
  | { status: 'active'; active: ActiveRun }
  | { status: 'error'; message: string };

export function useLiveStatus(auth: Auth | null): LiveStatus {
  const [state, setState] = useState<LiveStatus>({ status: 'idle' });

  useEffect(() => {
    if (!auth) {
      setState({ status: 'idle' });
      return;
    }
    setState({ status: 'connecting' });

    const es = new EventSource<'run.active' | 'tick'>(`${auth.serverUrl}/api/queue/live`, {
      headers: { Authorization: `Bearer ${auth.token}` },
    });

    es.addEventListener('open', () => {
      setState((prev) => (prev.status === 'active' ? prev : { status: 'open', active: null }));
    });
    es.addEventListener('run.active', (e: any) => {
      try {
        const data: ActiveRun = JSON.parse(e.data);
        setState({ status: 'active', active: data });
      } catch {
        // ignore parse errors
      }
    });
    es.addEventListener('error', (e: any) => {
      setState({ status: 'error', message: String(e?.message ?? 'sse error') });
    });

    return () => {
      es.close();
    };
  }, [auth?.serverUrl, auth?.token]);

  return state;
}
