/**
 * Shape matches packages/server/src/data/sqlite.ts InboxItemRow.
 */
export interface InboxItem {
  id: string;
  project_id?: string;
  content: string;
  status: string;
  linked_task_id?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface InboxListParams {
  status?: string;
  projectId?: string;
}
