/**
 * Shape matches packages/server/src/data/sqlite.ts ConversationRow + ConversationThread.
 */
export interface Conversation {
  id: string;
  project_id?: string;
  title?: string;
  status: string;
  created_by?: string;
  decision_summary?: string;
  created_at?: string;
  decided_at?: string;
  closed_at?: string;
  owner_session_id?: string;
  owner_type?: string;
  participant_count?: number;
  [key: string]: unknown;
}

export interface ConversationThread {
  conversation: Conversation;
  participants: Record<string, unknown>[];
  messages: Record<string, unknown>[];
  links: Record<string, unknown>[];
  actions: Record<string, unknown>[];
}

export interface ConversationListParams {
  status?: string;
  projectId?: string;
}
