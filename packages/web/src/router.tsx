// TASK-1159 — hash routing over the shell. Index redirects to the Sync pillar
// (the v1 payoff). Tabs deep-link so a screen survives a refresh.

import { createHashRouter, Navigate } from "react-router-dom";
import { Shell } from "./layouts/Shell";
import { SyncView } from "./views/SyncView";
import { CockpitView } from "./views/CockpitView";
import { KnowledgeView } from "./views/KnowledgeView";
import { GraphboardView } from "./views/GraphboardView";
import { SearchView } from "./views/SearchView";
import { CaptureView } from "./views/CaptureView";
import { ConversationsView } from "./views/ConversationsView";
import { VaultView } from "./views/VaultView";
import { TaskDetailView } from "./views/TaskDetailView";
import { WorkspaceDocsView } from "./views/WorkspaceDocsView";
import { ProjectsView } from "./views/ProjectsView";

export const router = createHashRouter([
  {
    path: "/",
    element: <Shell />,
    children: [
      { index: true, element: <Navigate to="/sync" replace /> },
      { path: "sync", element: <SyncView /> },
      // TASK-1765 — the top of the browse hierarchy: projects → workspaces →
      // docs and tasks. Before this, nothing enumerated projects at all.
      { path: "projects", element: <ProjectsView /> },
      { path: "cockpit", element: <CockpitView /> },
      { path: "knowledge", element: <KnowledgeView /> },
      { path: "graph", element: <GraphboardView /> },
      { path: "search", element: <SearchView /> },
      { path: "capture", element: <CaptureView /> },
      { path: "conversations", element: <ConversationsView /> },
      { path: "vault", element: <VaultView /> },
      // TASK-1748 — a task is a place you can link to, from Cockpit, Search or
      // Graph. The graph's own drawer is unchanged.
      { path: "tasks/:id", element: <TaskDetailView /> },
      // TASK-1749 — a workspace's own .md docs.
      { path: "workspace-docs", element: <WorkspaceDocsView /> },
      { path: "*", element: <Navigate to="/sync" replace /> },
    ],
  },
]);
