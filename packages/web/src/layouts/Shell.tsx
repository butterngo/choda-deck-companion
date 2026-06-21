// TASK-1159 AC-2 — top chrome: the three pillar tabs + the global health status
// bar. The Sync tab is the v1 payoff (Observatory); Cockpit + Knowledge are
// stubs this slice (TASK-1173 / TASK-1174 fill them).

import { NavLink, Outlet } from "react-router-dom";
import { useHealth } from "../hooks/use-health";
import { StatusBar } from "../components/StatusBar";

const TABS: ReadonlyArray<{ to: string; label: string; icon: string }> = [
  { to: "/sync", label: "Sync", icon: "ti-refresh" },
  { to: "/cockpit", label: "Cockpit", icon: "ti-layout-kanban" },
  { to: "/knowledge", label: "Knowledge", icon: "ti-book-2" },
];

export function Shell(): React.JSX.Element {
  const view = useHealth();

  return (
    <div className="min-h-screen flex flex-col max-w-page mx-auto">
      <header className="sticky top-0 z-10 bg-white/90 dark:bg-zinc-900/90 backdrop-blur tabstrip-shadow">
        <div className="flex items-center gap-1 px-4 pt-3 pb-2">
          <span className="font-medium mr-3">Companion</span>
          <nav className="flex gap-1" aria-label="pillars">
            {TABS.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm ${
                    isActive
                      ? "bg-zinc-100 dark:bg-zinc-800 text-blue-600 dark:text-blue-400"
                      : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                  }`
                }
              >
                <i className={`ti ${t.icon}`} aria-hidden="true" />
                {t.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <StatusBar view={view} />
      </header>

      <main className="flex-1 px-4 py-4">
        <Outlet context={view} />
      </main>
    </div>
  );
}
