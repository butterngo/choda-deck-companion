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

export type QueueTaskOutcome = {
  taskId: string;
  outcome: string;
  costUsd?: number;
  reason?: string;
  account?: string | null;
  worktreePath?: string;
  branch?: string;
  headSha?: string;
};

export type QueueRunMeta = {
  queueRunId: string;
  startedAt: string;
  endedAt?: string;
  totalCostUsd?: number;
  halted?: boolean;
  taskOutcomes?: QueueTaskOutcome[];
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

export type ProjectRow = {
  id: string;
  name: string;
  cwd: string;
};

export type WorkspaceRow = {
  id: string;
  project_id: string;
  label: string;
  cwd: string;
  archived_at?: string | null;
};

export function withProjectId(path: string, projectId?: string): string {
  if (!projectId) return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}projectId=${encodeURIComponent(projectId)}`;
}

export async function startQueueRun(
  auth: Auth,
  body: { taskId: string; projectId: string; workspaceId: string },
): Promise<{ queueRunId: string }> {
  const res = await fetch(`${auth.serverUrl}/api/queue/start`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${auth.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let message = text || `HTTP ${res.status}`;
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed.error === 'string') message = parsed.error;
    } catch {
      // body wasn't JSON — use raw text
    }
    throw new ApiError(res.status, message);
  }
  return res.json() as Promise<{ queueRunId: string }>;
}
