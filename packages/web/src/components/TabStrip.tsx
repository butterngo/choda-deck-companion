import { NavLink } from "react-router-dom";
import { SseStatus, type SseStatusValue } from "./SseStatus";
import { ServerUrlBadge } from "./ServerUrlBadge";
import { ThemeToggle } from "./ThemeToggle";

const TABS: Array<{ to: string; label: string; icon: string }> = [
  { to: "/queue", label: "Queue", icon: "ti-list" },
  { to: "/tasks", label: "Tasks", icon: "ti-checklist" },
  { to: "/inbox", label: "Inbox", icon: "ti-inbox" },
  { to: "/conversations", label: "Convos", icon: "ti-message-circle" },
  { to: "/settings", label: "Settings", icon: "ti-settings" },
];

const ACTIVE =
  "border-zinc-900 dark:border-zinc-100 font-medium text-zinc-900 dark:text-zinc-100";
const INACTIVE = "border-transparent text-zinc-500";

export function TabStrip({ sseStatus }: { sseStatus: SseStatusValue }) {
  return (
    <header className="sticky top-0 z-30 bg-white/95 dark:bg-zinc-900/95 backdrop-blur border-b border-zinc-200 dark:border-zinc-700">
      <div className="max-w-page mx-auto px-4 md:px-6">
        <nav className="flex items-center h-12 gap-1" role="tablist">
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              role="tab"
              className={({ isActive }) =>
                `inline-flex items-center gap-1 h-12 px-3 text-sm border-b-2 ${
                  isActive ? ACTIVE : INACTIVE
                }`
              }
            >
              <i className={`ti ${tab.icon} text-base`} aria-hidden="true" />
              <span>{tab.label}</span>
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
