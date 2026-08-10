// TASK-1595 — the app frame: a grouped sidebar (replacing TASK-858's eight flat
// tabs) plus the layout contract that stops views doing their own viewport math.
//
// The contract, in one line: THE SHELL OWNS WIDTH AND SCROLL. `<main>` is the
// single scrolling container for view content; a view renders content and never
// sets `calc(100vh - …)` to bound itself. Those clamps (TASK-1574) were a
// symptom of this contract being absent.
//
// The 1024px page cap from TASK-857 is removed — see that task's note. It is the
// direct cause of the cramped two-pane views this frame exists to fix.

import { NavLink, Outlet } from "react-router-dom";
import { useHealth } from "../hooks/use-health";
import { StatusBar } from "../components/StatusBar";
import { SidebarNav } from "../components/nav/SidebarNav";

export function Shell(): React.JSX.Element {
  const view = useHealth();

  return (
    <div className="h-screen flex overflow-hidden">
      <aside className="w-14 rail:w-[216px] flex-none flex flex-col min-h-0 bg-zinc-50 dark:bg-zinc-950 border-r border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center justify-center rail:justify-start gap-2 px-2 rail:px-3.5 pt-3.5 pb-2.5">
          <span className="grid place-items-center w-5 h-5 rounded bg-blue-600 text-white text-[11px] font-medium">
            C
          </span>
          <span className="font-medium sr-only rail:not-sr-only">Companion</span>
        </div>

        <SidebarNav />

        {/* Health is ambient status, so it lives at the foot of the chrome
            rather than as a full-width strip across the app. A banner over the
            content is reserved for something you should act on. */}
        <div className="flex-none border-t border-zinc-200 dark:border-zinc-800">
          <StatusBar view={view} />
          <div className="flex flex-col rail:flex-row gap-1.5 px-1.5 rail:px-2.5 pb-2.5">
            {/* Actions, not places — these two stopped being tabs. Search keeps
                a control until the ⌘K palette lands; without one, /search would
                be unreachable. */}
            <NavLink
              to="/search"
              className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-800 text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <i className="ti ti-search" aria-hidden="true" title="Search" />
              <span className="sr-only rail:not-sr-only">Search</span>
            </NavLink>
            <NavLink
              to="/capture"
              className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-800 text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <i className="ti ti-camera" aria-hidden="true" title="Capture" />
              <span className="sr-only rail:not-sr-only">Capture</span>
            </NavLink>
          </div>
        </div>
      </aside>

      {/* TASK-1623 — the shell hands each view the exact height it has, and the
          view decides whether to scroll as a page or fill and scroll inside its
          panes.

          It used to be `overflow-y-auto` here, which forced split views to
          guess their own height with `max-h-[calc(100vh - 18rem)]`. That
          arithmetic was wrong twice over: `18rem` was a guess at the chrome
          above the pane, and subtracting from `100vh` double-counts this
          element's own padding. Measured at 1080px tall it left 183px of dead
          space below both panes.

          `min-h-0` is load-bearing: without it a flex child refuses to shrink
          below its content and the inner `overflow-y-auto` never engages. */}
      <main className="flex-1 min-w-0 min-h-0 overflow-hidden flex flex-col px-4 rail:px-6 py-5">
        <Outlet context={view} />
      </main>
    </div>
  );
}
