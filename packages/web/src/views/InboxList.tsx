import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { StatusChips } from "../components/StatusChips";
import { WorkspaceFilter } from "../components/WorkspaceFilter";
import { api } from "../api";
import { useWorkspace } from "../hooks/use-workspace";
import { relativeTime } from "../utils";

export function InboxList() {
  const { activeProject } = useWorkspace();
  const [status, setStatus] = useState("");
  const { data = [], isLoading, error } = useQuery({
    queryKey: ["inbox", { status, projectId: activeProject }],
    queryFn: () => api.listInbox({ status: status || undefined, projectId: activeProject ?? undefined }),
  });

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <WorkspaceFilter />
      </div>
      <StatusChips value={status} onChange={setStatus} />
      {isLoading && <p className="text-zinc-500 text-sm">Loading…</p>}
      {error && (
        <p className="text-red-600 dark:text-red-400 text-sm">
          {(error as Error).message}
        </p>
      )}
      <ul className="divide-y divide-zinc-200 dark:divide-zinc-700">
        {data.map((item) => (
          <li key={item.id}>
            <Link
              to={`/inbox/${encodeURIComponent(item.id)}`}
              className="block py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              <div className="flex items-center gap-2 text-[12px]">
                <span className="mono text-zinc-500">{item.id}</span>
                <span className="text-zinc-500">{item.status}</span>
                <span className="ml-auto text-zinc-400">
                  {relativeTime(item.updated_at)}
                </span>
              </div>
              <p className="text-sm mt-0.5 line-clamp-2">{item.content}</p>
            </Link>
          </li>
        ))}
        {!isLoading && data.length === 0 && (
          <li className="py-6 text-center text-zinc-500 text-sm">Inbox empty.</li>
        )}
      </ul>
    </div>
  );
}
