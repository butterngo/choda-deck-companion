import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { useWorkspace } from "../hooks/use-workspace";

export function Settings() {
  const { activeProject, activeWorkspace, setActiveProject, setActiveWorkspace } = useWorkspace();
  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => api.listProjects(),
  });
  const { data: workspaces = [] } = useQuery({
    queryKey: ["workspaces", activeProject],
    queryFn: () => api.listWorkspaces(activeProject ?? undefined),
  });

  return (
    <div className="space-y-6 max-w-xl">
      <h1 className="text-[22px]">Settings</h1>

      <section>
        <h2 className="text-[16px] mb-2">Server</h2>
        <p className="text-[13px] text-zinc-600 dark:text-zinc-400">
          Web app is served by Hono at{" "}
          <span className="mono">{typeof window !== "undefined" ? window.location.host : ""}</span>.
        </p>
      </section>

      <section>
        <h2 className="text-[16px] mb-2">Active project</h2>
        <select
          value={activeProject ?? ""}
          onChange={(e) => {
            setActiveProject(e.target.value || null);
            setActiveWorkspace(null);
          }}
          className="w-full text-sm bg-transparent border border-zinc-200 dark:border-zinc-700 rounded px-2 py-1"
        >
          <option value="">(none)</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </section>

      <section>
        <h2 className="text-[16px] mb-2">Active workspace</h2>
        <select
          value={activeWorkspace ?? ""}
          onChange={(e) => setActiveWorkspace(e.target.value || null)}
          className="w-full text-sm bg-transparent border border-zinc-200 dark:border-zinc-700 rounded px-2 py-1"
          disabled={!activeProject}
        >
          <option value="">(none)</option>
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.label}
            </option>
          ))}
        </select>
        {!activeProject && (
          <p className="mt-2 text-[12px] text-zinc-500">Pick a project first.</p>
        )}
      </section>

      <section>
        <h2 className="text-[16px] mb-2">Theme</h2>
        <p className="text-[13px] text-zinc-600 dark:text-zinc-400">
          Use the theme toggle in the top right of the tab strip. Saved to{" "}
          <span className="mono">localStorage.theme</span>.
        </p>
      </section>
    </div>
  );
}
