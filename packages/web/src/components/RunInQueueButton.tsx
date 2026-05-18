import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ApiError, api } from "../api";

export function RunInQueueButton({
  taskId,
  projectId,
  workspaceId,
  disabled,
}: {
  taskId: string;
  projectId?: string;
  workspaceId?: string | null;
  disabled?: boolean;
}) {
  const navigate = useNavigate();
  const mut = useMutation({
    mutationFn: () => {
      if (!projectId || !workspaceId) {
        throw new Error("Pick a workspace in Settings before running");
      }
      return api.startQueueRun({ taskId, projectId, workspaceId, source: "web" });
    },
    onSuccess: () => navigate("/queue"),
  });

  const errMsg =
    mut.error instanceof ApiError
      ? mut.error.body
      : mut.error instanceof Error
      ? mut.error.message
      : null;

  return (
    <div className="my-3">
      <button
        type="button"
        disabled={disabled || mut.isPending}
        onClick={() => mut.mutate()}
        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-600 rounded hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50"
      >
        <i className={`ti ${mut.isPending ? "ti-loader-2 spin" : "ti-play"}`} aria-hidden="true" />
        Run in queue
      </button>
      {errMsg && (
        <p className="mt-2 text-[12px] text-red-600 dark:text-red-400">{errMsg}</p>
      )}
    </div>
  );
}
