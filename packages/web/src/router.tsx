// TASK-1159 — hash routing over the shell. Index redirects to the Sync pillar
// (the v1 payoff). Tabs deep-link so a screen survives a refresh.

import { createHashRouter, Navigate, type RouteObject } from "react-router-dom";
import { Shell } from "./layouts/Shell";
import { SyncView } from "./views/SyncView";
import { KnowledgeView } from "./views/KnowledgeView";
import { GraphboardView } from "./views/GraphboardView";
import { SearchView } from "./views/SearchView";
import { CaptureView } from "./views/CaptureView";
import { ConversationsView } from "./views/ConversationsView";
import { VaultView } from "./views/VaultView";
import { TaskDetailView } from "./views/TaskDetailView";
import { WorkspaceDocsView } from "./views/WorkspaceDocsView";
import { ProjectsView } from "./views/ProjectsView";
import { WorkspaceView } from "./views/WorkspaceView";
import { ActivityView } from "./views/ActivityView";

// Exported so a test can mount the REAL route table in a memory router — the
// only way to prove a path is not swallowed by the catch-all below.
export const routes: RouteObject[] = [
  {
    path: "/",
    element: <Shell />,
    children: [
      { index: true, element: <Navigate to="/sync" replace /> },
      { path: "sync", element: <SyncView /> },
      // TASK-1765 — the top of the browse hierarchy: projects → workspaces →
      // docs and tasks. Before this, nothing enumerated projects at all.
      { path: "projects", element: <ProjectsView /> },
      // TASK-1766 — a workspace as a place: its docs and its tasks, and from a
      // task the ADR/files/commits behind it.
      { path: "workspaces/:id", element: <WorkspaceView /> },
      { path: "knowledge", element: <KnowledgeView /> },
      { path: "graph", element: <GraphboardView /> },
      { path: "search", element: <SearchView /> },
      { path: "capture", element: <CaptureView /> },
      { path: "conversations", element: <ConversationsView /> },
      { path: "vault", element: <VaultView /> },
      // TASK-1748 — a task is a place you can link to, from a workspace, Search
      // or Graph. The graph's own drawer is unchanged.
      { path: "tasks/:id", element: <TaskDetailView /> },
      // TASK-1749 — a workspace's own .md docs.
      { path: "workspace-docs", element: <WorkspaceDocsView /> },
      // TASK-2153 — daily activity digests: the four success metrics as trends.
      { path: "activity", element: <ActivityView /> },
      { path: "*", element: <Navigate to="/sync" replace /> },
    ],
  },
];

export const router = createHashRouter(routes);
