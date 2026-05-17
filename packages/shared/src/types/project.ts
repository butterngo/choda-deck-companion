/**
 * Shape matches packages/server/src/data/sqlite.ts ProjectRow + WorkspaceRow.
 */
export interface Project {
  id: string;
  name: string;
  cwd: string;
}

export interface Workspace {
  id: string;
  project_id: string;
  label: string;
  cwd: string;
  archived_at?: string | null;
}
