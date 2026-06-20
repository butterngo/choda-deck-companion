import { useQuery } from "@tanstack/react-query";
import { NavLink } from "react-router-dom";
import { api } from "../api";
import { useLiveQueueContext } from "../layouts/Shell";
import { SseStatus, type SseStatusValue } from "./SseStatus";
import { ServerUrlBadge } from "./ServerUrlBadge";
import { ThemeToggle } from "./ThemeToggle";

const TABS: Array<{ to: string; label: string; icon: string }> = [
  { to: "/queue", label: "Queue", icon: "ti-list" },
  { to: "/tasks", label: "Tasks", icon: "ti-checklist" },
];

const ACTIVE =
  "border-blue-600 dark:border-blue-400 font-medium text-zinc-900 dark:text-zinc-100";
const INACTIVE = "border-transparent text-zinc-500";

/**
 * Live tab badges:
 *   Queue → number of active runs (LiveQueueState.active ? 1 : 0)
 *   Tasks → READY + IN-PROGRESS count from /api/tasks (polled 15s)
 * Hidden when N = 0 per docs/handoff-design/project/uploads/01-shell-and-navigation.md.
 */
function useTabCounts() {
  const live = useLiveQueueContext();
  const queueCount = live.active ? 1 : 0;
  const { data: readyTasks = [] } = useQuery({
    queryKey: ["tasks-count", "READY,IN-PROGRESS"],
    queryFn: () => api.listTasks({ status: "READY,IN-PROGRESS" }),
    staleTime: 15_000,
    refetchInterval: 15_000,
  });
  return { queue: queueCount, tasks: readyTasks.length };
}

function CountBadge({ value }: { value: number }) {
  if (value <= 0) return null;
  return (
    <span className="ml-1 mono text-[11px] px-1.5 py-px rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
      ({value})
    </span>
  );
}

export function TabStrip({ sseStatus }: { sseStatus: SseStatusValue }) {
  const counts = useTabCounts();
  return (
    <header className="sticky top-0 z-30 bg-white/95 dark:bg-zinc-900/95 backdrop-blur tabstrip-shadow">
      <div className="max-w-page mx-auto px-4 md:px-6">
        <nav className="flex items-center h-12 gap-1" role="tablist">
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              role="tab"
              className={({ isActive }) =>
                `inline-flex items-center gap-1.5 h-12 px-3 text-sm border-b-2 ${
                  isActive ? ACTIVE : INACTIVE
                }`
              }
            >
              <i className={`ti ${tab.icon} text-base`} aria-hidden="true" />
              <span>{tab.label}</span>
              <CountBadge
                value={tab.to === "/queue" ? counts.queue : counts.tasks}
              />
            </NavLink>
          ))}
          <div className="ml-auto flex items-center gap-3 text-zinc-400">
            <SseStatus status={sseStatus} />
            <ServerUrlBadge />
            <ThemeToggle />
          </div>
        </nav>
      </div>
    </header>
  );
}
