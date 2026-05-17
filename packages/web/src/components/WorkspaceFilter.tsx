import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { useWorkspace } from "../hooks/use-workspace";

export function WorkspaceFilter() {
  const { activeWorkspace, setActiveWorkspace } = useWorkspace();
  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => api.listProjects(),
  });
  const { data: workspaces = [] } = useQuery({
    queryKey: ["workspaces"],
    queryFn: () => api.listWorkspaces(),
  });

  return (
    <select
      value={activeWorkspace ?? ""}
      onChange={(e) => setActiveWorkspace(e.target.value || null)}
      className="text-[12px] bg-transparent border border-zinc-200 dark:border-zinc-700 rounded px-2 py-1"
      aria-label="Workspace filter"
    >
      <option value="">All workspaces</option>
      {projects.map((p) => (
        <optgroup key={p.id} label={p.name}>
          {workspaces
            .filter((w) => w.project_id === p.id)
            .map((w) => (
              <option key={w.id} value={w.id}>
                {w.label}
              </option>
            ))}
        </optgroup>
      ))}
    </select>
  );
}
