import type { Task, TaskListParams } from "../types/task.js";
import type {
  QueueRunDetail,
  QueueRunSummary,
  QueueStartRequest,
  QueueStartResponse,
} from "../types/queue.js";
import type { InboxItem, InboxListParams } from "../types/inbox.js";
import type {
  Conversation,
  ConversationListParams,
  ConversationThread,
} from "../types/conversation.js";
import type { Project, Workspace } from "../types/project.js";

export class ApiError extends Error {
  readonly status: number;
  readonly body: string;
  constructor(status: number, body: string) {
    super(`API ${status}: ${body}`);
    this.status = status;
    this.body = body;
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  token?: string;
  fetchImpl?: typeof fetch;
}

export interface ApiClient {
  listTasks(params?: TaskListParams): Promise<Task[]>;
  getTask(id: string): Promise<Task>;
  listQueueRuns(): Promise<QueueRunSummary[]>;
  getQueueRun(id: string): Promise<QueueRunDetail>;
  startQueue(body: QueueStartRequest): Promise<QueueStartResponse>;
  listInbox(params?: InboxListParams): Promise<InboxItem[]>;
  getInbox(id: string): Promise<InboxItem>;
  listConversations(params?: ConversationListParams): Promise<Conversation[]>;
  getConversation(id: string): Promise<ConversationThread>;
  listProjects(): Promise<Project[]>;
  listWorkspaces(projectId?: string): Promise<Workspace[]>;
}

export function createApiClient(opts: ApiClientOptions): ApiClient {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const headers: Record<string, string> = {};
  if (opts.token) headers["Authorization"] = `Bearer ${opts.token}`;

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const url = `${opts.baseUrl.replace(/\/$/, "")}${path}`;
    const res = await fetchImpl(url, {
      ...init,
      headers: { ...headers, ...(init?.headers ?? {}) },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new ApiError(res.status, body);
    }
    return (await res.json()) as T;
  }

  function qs(params: Record<string, string | string[] | undefined>): string {
    const usp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined) continue;
      if (Array.isArray(v)) {
        if (v.length > 0) usp.set(k, v.join(","));
      } else {
        usp.set(k, v);
      }
    }
    const s = usp.toString();
    return s ? `?${s}` : "";
  }

  return {
    listTasks: (params) =>
      request<Task[]>(
        `/api/tasks${qs({
          status: params?.status,
          projectId: params?.projectId,
          labels: params?.labels,
          query: params?.query,
        })}`,
      ),
    getTask: (id) => request<Task>(`/api/tasks/${encodeURIComponent(id)}`),
    listQueueRuns: () => request<QueueRunSummary[]>(`/api/queue`),
    getQueueRun: (id) => request<QueueRunDetail>(`/api/queue/${encodeURIComponent(id)}`),
    startQueue: (body) =>
      request<QueueStartResponse>(`/api/queue/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    listInbox: (params) =>
      request<InboxItem[]>(
        `/api/inbox${qs({ status: params?.status, projectId: params?.projectId })}`,
      ),
    getInbox: (id) => request<InboxItem>(`/api/inbox/${encodeURIComponent(id)}`),
    listConversations: (params) =>
      request<Conversation[]>(
        `/api/conversations${qs({ status: params?.status, projectId: params?.projectId })}`,
      ),
    getConversation: (id) =>
      request<ConversationThread>(`/api/conversations/${encodeURIComponent(id)}`),
    listProjects: () => request<Project[]>(`/api/projects`),
    listWorkspaces: (projectId) =>
      request<Workspace[]>(`/api/workspaces${qs({ projectId })}`),
  };
}
