// Slide-over that shows a graph node's full detail — task (GET /tasks/:id) or
// knowledge (GET /knowledge/:slug, reusing the Knowledge tab's KnowledgeDetail).
// Both hooks run unconditionally (disabled by the id being null) so hook order is
// stable regardless of node type.

import type { GraphNodeType } from "../api";
import { useTask } from "../hooks/use-task";
import { useKnowledgeEntry } from "../hooks/use-knowledge";
import { TaskDetailPanel } from "./TaskDetailPanel";
import { KnowledgeDetail } from "./KnowledgeDetail";

export interface NodeRef {
  id: string;
  type: GraphNodeType;
}

export function NodeDetailDrawer({ node, onClose }: { node: NodeRef; onClose: () => void }): React.JSX.Element {
  const task = useTask(node.type === "task" ? node.id : null);
  const knowledge = useKnowledgeEntry(node.type === "knowledge" ? node.id : null);

  const isLoading = node.type === "task" ? task.isLoading : knowledge.isLoading;
  const isError = node.type === "task" ? task.isError : knowledge.isError;

  return (
    <aside
      aria-label="node detail drawer"
      className="fixed right-0 top-0 z-20 h-full w-[380px] max-w-[90vw] overflow-y-auto border-l border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-xl p-4"
    >
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium">{node.type === "task" ? "Task" : "Knowledge"} detail</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="close drawer"
          className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
        >
          ✕
        </button>
      </div>

      {isError ? (
        <p role="alert" className="text-sm text-rose-700 dark:text-rose-400">
          Couldn’t load {node.id}.
        </p>
      ) : isLoading ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : node.type === "task" && task.task ? (
        <TaskDetailPanel task={task.task} />
      ) : node.type === "knowledge" && knowledge.entry ? (
        <KnowledgeDetail entry={knowledge.entry} />
      ) : (
        <p className="text-sm text-zinc-500">No detail available for {node.id}.</p>
      )}
    </aside>
  );
}
