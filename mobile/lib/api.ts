import type { Auth } from './auth';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function apiFetch<T>(auth: Auth, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${auth.serverUrl}${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${auth.token}`,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new ApiError(res.status, body || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export type TaskRow = {
  id: string;
  title?: string;
  status: string;
  priority?: string;
  labels?: string;
  updated_at?: string;
  [key: string]: unknown;
};

export type ConversationRow = {
  id: string;
  title: string;
  status: string;
  created_by: string;
  decision_summary?: string;
  created_at: string;
  decided_at?: string | null;
  closed_at?: string | null;
};

export type ConversationMessage = {
  id: string;
  conversation_id: string;
  author_name: string;
  content: string;
  message_type: string;
  created_at: string;
};

export type ConversationThread = {
  conversation: ConversationRow;
  participants: { participant_name: string; participant_type: string }[];
  messages: ConversationMessage[];
  links: { linked_type: string; linked_id: string }[];
  actions: { id: string; assignee: string; description: string; status: string }[];
};

export type QueueRunSummary = {
  id: string;
  taskCount: number;
  totalCostUsd: number;
  durationMs: number;
  status: 'running' | 'finished' | 'failed';
  finishedAt: string | null;
};

export type QueueTask = {
  id: string;
  outcome: string;
  costUsd?: number;
};

export type QueueRunMeta = {
  queueRunId: string;
  startedAt: string;
  endedAt?: string;
  totalCostUsd?: number;
  halted?: boolean;
  tasks?: QueueTask[];
  [key: string]: unknown;
};

export type QueueRunDetail = {
  meta: QueueRunMeta;
  report: string;
};

export type InboxRow = {
  id: string;
  project_id?: string | null;
  content: string;
  status: 'raw' | 'researching' | 'ready' | 'converted' | 'archived';
  linked_task_id?: string | null;
  created_at?: string;
  updated_at?: string;
};
