/**
 * Shape matches packages/server/src/data/sqlite.ts TaskRow + queryTasks/getTask responses.
 * Snake_case preserved from SQLite — server does not transform.
 */
export interface Task {
  id: string;
  project_id?: string;
  title?: string;
  status: string;
  priority?: string;
  body?: string;
  labels?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface TaskListParams {
  status?: string;
  projectId?: string;
  labels?: string[];
  query?: string;
}
