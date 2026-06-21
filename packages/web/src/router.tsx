// TASK-1159 — hash routing over the shell. Index redirects to the Sync pillar
// (the v1 payoff). Tabs deep-link so a screen survives a refresh.

import { createHashRouter, Navigate } from "react-router-dom";
import { Shell } from "./layouts/Shell";
import { SyncView } from "./views/SyncView";
import { CockpitView } from "./views/CockpitView";
import { KnowledgeView } from "./views/KnowledgeView";

export const router = createHashRouter([
  {
    path: "/",
    element: <Shell />,
    children: [
      { index: true, element: <Navigate to="/sync" replace /> },
      { path: "sync", element: <SyncView /> },
      { path: "cockpit", element: <CockpitView /> },
      { path: "knowledge", element: <KnowledgeView /> },
      { path: "*", element: <Navigate to="/sync" replace /> },
    ],
  },
]);
