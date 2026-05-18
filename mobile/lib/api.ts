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
