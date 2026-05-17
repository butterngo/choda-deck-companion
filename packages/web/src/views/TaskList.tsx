import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import type { Task } from "shared/types";
import { AutoSafeFilter } from "../components/AutoSafeFilter";
import { TaskSearchBox } from "../components/TaskSearchBox";
import { WorkspaceFilter } from "../components/WorkspaceFilter";
import { api } from "../api";
import { useWorkspace } from "../hooks/use-workspace";
import { statusClass, statusIcon } from "../utils";

const READY_FOR_QUEUE = new Set(["READY", "IN-PROGRESS", "TODO"]);

export function TaskList() {
  const { activeProject } = useWorkspace();
  const [query, setQuery] = useState("");
  const [autoSafeOnly, setAutoSafeOnly] = useState(false);

  const { data = [], isLoading, error } = useQuery({
    queryKey: ["tasks", { projectId: activeProject, query }],
    queryFn: () =>
      api.listTasks({
        projectId: activeProject ?? undefined,
        query: query || undefined,
      }),
  });

  const filtered = autoSafeOnly
    ? data.filter((t) => parseLabels(t.labels).includes("auto-safe"))
    : data;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <WorkspaceFilter />
        <AutoSafeFilter value={autoSafeOnly} onChange={setAutoSafeOnly} />
      </div>
      <TaskSearchBox value={query} onChange={setQuery} />
      {isLoading && <p className="text-zinc-500 text-sm">Loading…</p>}
      {error && (
        <p className="text-red-600 dark:text-red-400 text-sm">
          {(error as Error).message}
        </p>
      )}
      <ul className="divide-y divide-zinc-200 dark:divide-zinc-700">
        {filtered.map((t) => (
          <TaskRow key={t.id} task={t} />
        ))}
        {!isLoading && filtered.length === 0 && (
          <li className="py-6 text-center text-zinc-500 text-sm">No tasks.</li>
        )}
      </ul>
    </div>
  );
}

function TaskRow({ task }: { task: Task }) {
  const ready = READY_FOR_QUEUE.has(task.status);
  return (
    <li>
      <Link
        to={`/tasks/${encodeURIComponent(task.id)}`}
        className="flex items-center gap-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800"
      >
        <i
          className={`ti ${statusIcon(task.status)} ${statusClass(task.status)}`}
          aria-hidden="true"
        />
        <span className="mono text-[12px] text-zinc-500 w-24 truncate">{task.id}</span>
        <span className="flex-1 truncate text-sm">{task.title ?? ""}</span>
        <span
          className={`text-[12px] w-24 text-right ${ready ? "text-blue-600 dark:text-blue-400" : "text-zinc-500"}`}
        >
          {task.status}
        </span>
      </Link>
    </li>
  );
}

function parseLabels(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed.filter((x) => typeof x === "string") as string[]) : [];
  } catch {
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
}
