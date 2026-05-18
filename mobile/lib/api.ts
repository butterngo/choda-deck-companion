import type { Auth } from './auth';
import type {
  Task,
  Conversation,
  QueueRunSummary,
  TaskOutcome,
  QueueRunMeta,
  QueueRunDetail,
  InboxItem,
  Project,
  Workspace,
} from 'shared/types';

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

// Re-export shared canonical types + backward-compat aliases for mobile callsites
export type { Task, QueueRunSummary, QueueRunMeta, QueueRunDetail };
export type TaskRow = Task;
export type ConversationRow = Conversation;
export type QueueTaskOutcome = TaskOutcome;
export type InboxRow = InboxItem;
export type ProjectRow = Project;
export type WorkspaceRow = Workspace;

// Mobile-only — no shared equivalent
export type ConversationMessage = {
  id: string;
  conversation_id: string;
  author_name: string;
  content: string;
  message_type: string;
  created_at: string;
};

// Mobile-specific shape: messages typed as ConversationMessage[], not Record<string, unknown>[]
export type ConversationThread = {
  conversation: ConversationRow;
  participants: { participant_name: string; participant_type: string }[];
  messages: ConversationMessage[];
  links: { linked_type: string; linked_id: string }[];
  actions: { id: string; assignee: string; description: string; status: string }[];
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
