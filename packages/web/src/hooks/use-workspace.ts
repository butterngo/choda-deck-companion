import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "activeWorkspace";
const PROJECT_KEY = "activeProject";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

/**
 * Workspace + project pinned in localStorage; shared across tabs that filter
 * by workspace (Tasks, Inbox, Convos). Storage-event listener keeps multiple
 * browser tabs in sync.
 */
export function useWorkspace() {
  const [activeWorkspace, setW] = useState<string | null>(() => read(STORAGE_KEY));
  const [activeProject, setP] = useState<string | null>(() => read(PROJECT_KEY));

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setW(e.newValue);
      if (e.key === PROJECT_KEY) setP(e.newValue);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setActiveWorkspace = useCallback((id: string | null) => {
    setW(id);
    write(STORAGE_KEY, id);
  }, []);

  const setActiveProject = useCallback((id: string | null) => {
    setP(id);
    write(PROJECT_KEY, id);
  }, []);

  return { activeWorkspace, activeProject, setActiveWorkspace, setActiveProject };
}
