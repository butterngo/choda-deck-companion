// TASK-1173 — the Cockpit needs a workspaceId to call /workflow/focus, but the
// adapter has no endpoint to enumerate workspaces (GET /projects returns flat
// projects only, no workspaces[]). Until that lands, the user types the id once
// and it's remembered — an honest manual gap, not a guessed default.

import { useState } from "react";

const STORAGE_KEY = "choda.cockpit.workspaceId";

export interface WorkspaceSelection {
  workspaceId: string | null;
  setWorkspaceId: (id: string) => void;
}

export function useWorkspace(): WorkspaceSelection {
  const [workspaceId, setWorkspaceIdState] = useState<string | null>(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored && stored.length > 0 ? stored : null;
  });

  const setWorkspaceId = (id: string): void => {
    const trimmed = id.trim();
    if (trimmed.length === 0) return;
    window.localStorage.setItem(STORAGE_KEY, trimmed);
    setWorkspaceIdState(trimmed);
  };

  return { workspaceId, setWorkspaceId };
}
