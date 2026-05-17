import { useEffect, useReducer } from 'react';
import EventSource from 'react-native-sse';

import type { Auth } from './auth';

export type ActiveRun = { queueRunId: string; taskCount: number; startedAt: string };

export type LiveTaskState = {
  status: string;
  startedAt?: number;
  costUsd?: number;
  durationMs?: number;
};

export type LiveActiveRun = ActiveRun & {
  totalCostUsd: number;
  tasks: Record<string, LiveTaskState>;
};

export type LiveStatus =
  | { status: 'idle' }
  | { status: 'connecting' }
  | { status: 'open'; active: null }
  | { status: 'active'; active: LiveActiveRun }
  | { status: 'error'; message: string };

type Action =
  | { type: 'reset' }
  | { type: 'open' }
  | { type: 'run.active'; run: ActiveRun }
  | { type: 'tick'; evt: TickEvent }
  | { type: 'error'; message: string };

type TickEvent =
  | { event: 'task.started'; taskId: string }
  | { event: 'task.finished'; taskId: string; outcome?: string; costUsd?: number; durationMs?: number }
  | { event: 'run.finished' }
  | { event: 'run.failed' }
  | { event: string; [k: string]: unknown };

function reducer(state: LiveStatus, action: Action): LiveStatus {
  switch (action.type) {
    case 'reset':
      return { status: 'idle' };
    case 'open':
      return state.status === 'active' ? state : { status: 'open', active: null };
    case 'run.active':
      return {
        status: 'active',
        active: {
          ...action.run,
          totalCostUsd: 0,
          tasks: {},
        },
      };
    case 'tick': {
      if (state.status !== 'active') return state;
      const e = action.evt;
      if (e.event === 'task.started') {
        const tid = (e as { taskId: string }).taskId;
        if (!tid) return state;
        return {
          ...state,
          active: {
            ...state.active,
            tasks: {
              ...state.active.tasks,
              [tid]: { status: 'IN-PROGRESS', startedAt: Date.now() },
            },
          },
        };
      }
      if (e.event === 'task.finished') {
        const tid = (e as { taskId: string }).taskId;
        if (!tid) return state;
        const prev = state.active.tasks[tid] ?? { status: 'DONE' };
        const finished = {
          status: (e as { outcome?: string }).outcome || 'DONE',
          startedAt: prev.startedAt,
          costUsd: (prev.costUsd ?? 0) + ((e as { costUsd?: number }).costUsd ?? 0),
          durationMs: (e as { durationMs?: number }).durationMs,
        };
        return {
          ...state,
          active: {
            ...state.active,
            totalCostUsd: state.active.totalCostUsd + ((e as { costUsd?: number }).costUsd ?? 0),
            tasks: { ...state.active.tasks, [tid]: finished },
          },
        };
      }
      if (e.event === 'run.finished' || e.event === 'run.failed') {
        return { status: 'open', active: null };
      }
      return state;
    }
    case 'error':
      return { status: 'error', message: action.message };
    default:
      return state;
  }
}

export function useLiveStatus(auth: Auth | null): LiveStatus {
  const [state, dispatch] = useReducer(reducer, { status: 'idle' });

  useEffect(() => {
    if (!auth) {
      dispatch({ type: 'reset' });
      return;
    }
    dispatch({ type: 'open' });

    const es = new EventSource<'run.active' | 'tick'>(`${auth.serverUrl}/api/queue/live`, {
      headers: { Authorization: `Bearer ${auth.token}` },
    });

    es.addEventListener('open', () => dispatch({ type: 'open' }));
    es.addEventListener('run.active', (e: any) => {
      try {
        const run: ActiveRun = JSON.parse(e.data);
        dispatch({ type: 'run.active', run });
      } catch {
        // ignore parse errors
      }
    });
    es.addEventListener('tick', (e: any) => {
      try {
        const evt = JSON.parse(e.data) as TickEvent;
        dispatch({ type: 'tick', evt });
      } catch {
        // ignore parse errors
      }
    });
    es.addEventListener('error', (e: any) => {
      dispatch({ type: 'error', message: String(e?.message ?? 'sse error') });
    });

    return () => {
      es.close();
    };
  }, [auth?.serverUrl, auth?.token]);

  return state;
}
