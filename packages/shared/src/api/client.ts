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
import { ApiError } from "./errors.js";

export type ApiClientConfig = {
  baseUrl: string;
  getAuthHeader?: () => Record<string, string> | null;
  fetchImpl?: typeof fetch;
};

export interface ApiClient {
  listTasks(params?: TaskListParams): Promise<Task[]>;
  getTask(id: string): Promise<Task>;
  listQueueRuns(): Promise<QueueRunSummary[]>;
  getQueueRun(id: string): Promise<QueueRunDetail>;
  startQueueRun(body: QueueStartRequest): Promise<QueueStartResponse>;
  listInbox(params?: InboxListParams): Promise<InboxItem[]>;
  getInbox(id: string): Promise<InboxItem>;
  listConversations(params?: ConversationListParams): Promise<Conversation[]>;
  getConversation(id: string): Promise<ConversationThread>;
  listProjects(): Promise<Project[]>;
  listWorkspaces(projectId?: string): Promise<Workspace[]>;
}

export function createApiClient(cfg: ApiClientConfig): ApiClient {
  const fetchImpl = cfg.fetchImpl ?? fetch;

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const authHeaders = cfg.getAuthHeader?.() ?? null;
    const url = `${cfg.baseUrl.replace(/\/$/, "")}${path}`;
    const res = await fetchImpl(url, {
      ...init,
      headers: {
        ...(authHeaders ?? {}),
        ...(init?.headers as Record<string, string> | undefined ?? {}),
      },
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
    getQueueRun: (id) =>
      request<QueueRunDetail>(`/api/queue/${encodeURIComponent(id)}`),
    startQueueRun: (body) =>
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
        `/api/conversations${qs({
          status: params?.status,
          projectId: params?.projectId,
        })}`,
      ),
    getConversation: (id) =>
      request<ConversationThread>(
        `/api/conversations/${encodeURIComponent(id)}`,
      ),
    listProjects: () => request<Project[]>(`/api/projects`),
    listWorkspaces: (projectId) =>
      request<Workspace[]>(`/api/workspaces${qs({ projectId })}`),
  };
}
