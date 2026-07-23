// TASK-1465 — real dropdown over GET /workspaces, replacing the manual
// workspaceId text-entry (TASK-1173's WorkspacePrompt). Falls back to the old
// manual entry honestly if the list fails or comes back empty — never a
// dead-end dropdown with no way to proceed.

import { useWorkspaces } from "../hooks/use-workspaces";

export function WorkspaceSelect({ onSubmit }: { onSubmit: (id: string) => void }): React.JSX.Element {
  const { workspaces, isLoading, isError } = useWorkspaces();

  if (isLoading) {
    return <p className="text-sm text-zinc-500">Loading workspaces…</p>;
  }

  if (isError || workspaces.length === 0) {
    return <ManualWorkspaceEntry onSubmit={onSubmit} />;
  }

  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const select = e.currentTarget.elements.namedItem("workspaceId") as HTMLSelectElement;
        if (select.value) onSubmit(select.value);
      }}
    >
      <label htmlFor="workspaceId" className="text-sm text-zinc-500">
        Workspace:
      </label>
      <select
        id="workspaceId"
        name="workspaceId"
        defaultValue=""
        className="px-2 py-1.5 rounded-md text-sm border border-zinc-300 dark:border-zinc-700 bg-transparent"
      >
        <option value="" disabled>
          Select a workspace…
        </option>
        {workspaces.map((w) => (
          <option key={w.id} value={w.id}>
            {w.label} ({w.projectId})
          </option>
        ))}
      </select>
      <button type="submit" className="px-3 py-1.5 rounded-md text-sm bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700">
        Load
      </button>
    </form>
  );
}

function ManualWorkspaceEntry({ onSubmit }: { onSubmit: (id: string) => void }): React.JSX.Element {
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const input = e.currentTarget.elements.namedItem("workspaceId") as HTMLInputElement;
        onSubmit(input.value);
      }}
    >
      <label htmlFor="workspaceId" className="text-sm text-zinc-500">
        Workspace id:
      </label>
      <input
        id="workspaceId"
        name="workspaceId"
        type="text"
        placeholder="choda-deck-companion"
        className="px-2 py-1.5 rounded-md text-sm border border-zinc-300 dark:border-zinc-700 bg-transparent"
      />
      <button type="submit" className="px-3 py-1.5 rounded-md text-sm bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700">
        Load
      </button>
    </form>
  );
}
