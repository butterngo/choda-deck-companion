// TASK-1595 — the grouped sidebar that replaces the eight flat tabs from
// TASK-858. Presentational: it takes counts as props and reads only the current
// route, so tests drive it directly without mocking data hooks.
//
// Structure follows the design note §4. Two entries deliberately stopped being
// tabs, because they are actions rather than places: Capture and Search live in
// the foot. Search keeps a control at all: the ⌘K palette that is meant to
// replace it is a separate task, and removing the tab before that lands would
// make /search unreachable.

import { NavLink, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";

export interface NavCounts {
  projects?: number;
  cockpit?: number;
  conversations?: number;
  knowledge?: number;
  vault?: number;
}

const KNOWLEDGE_PATHS = ["/knowledge", "/vault"];

function itemClass({ isActive }: { isActive: boolean }): string {
  return [
    "relative flex items-center gap-2.5 w-full px-2 py-1.5 rounded-md text-sm text-left",
    "justify-center rail:justify-start rail:group-data-[collapsed=true]/shell:justify-center",
    isActive
      ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium"
      : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50",
  ].join(" ");
}

function Count({ n }: { n?: number }): React.JSX.Element | null {
  if (n === undefined) return null;
  return (
    <span className="ml-auto text-xs tabular-nums text-zinc-400 hidden rail:inline rail:group-data-[collapsed=true]/shell:hidden">{n}</span>
  );
}

function Item({
  to,
  icon,
  label,
  count,
}: {
  to: string;
  icon: string;
  label: string;
  count?: number;
}): React.JSX.Element {
  return (
    <NavLink to={to} className={itemClass}>
      <i className={`ti ${icon} text-zinc-400`} aria-hidden="true" title={label} />
      <span className="sr-only rail:not-sr-only rail:group-data-[collapsed=true]/shell:sr-only">{label}</span>
      <Count n={count} />
    </NavLink>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="px-2 pb-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-400 hidden rail:block rail:group-data-[collapsed=true]/shell:hidden">
      {children}
    </div>
  );
}

export function SidebarNav({ counts = {} }: { counts?: NavCounts }): React.JSX.Element {
  const { pathname } = useLocation();
  const insideKnowledge = KNOWLEDGE_PATHS.includes(pathname);
  const [open, setOpen] = useState(true);

  // AC-4 — landing on a child from the URL (a deep link, or the future ⌘K
  // palette) must not leave the section looking inert.
  useEffect(() => {
    if (insideKnowledge) setOpen(true);
  }, [insideKnowledge]);

  // You cannot collapse the section you are currently inside: hiding the item
  // that is highlighted as active reads as a bug, not a preference.
  const expanded = open || insideKnowledge;

  // Rolled up, never hard-coded — a collapsed parent still has to say the
  // section is non-empty, and it must agree with its children.
  const childCounts = [counts.knowledge, counts.vault].filter(
    (n): n is number => n !== undefined
  );
  const knowledgeTotal =
    childCounts.length > 0 ? childCounts.reduce((a, b) => a + b, 0) : undefined;

  return (
    <nav id="sidebar-nav"
      className="flex-1 min-h-0 overflow-y-auto px-1.5 rail:px-2.5 rail:group-data-[collapsed=true]/shell:px-1.5 pb-2.5"
      aria-label="Sections">
      <div className="mb-3.5 rail:group-data-[collapsed=true]/shell:mb-0 rail:group-data-[collapsed=true]/shell:pb-1.5 rail:group-data-[collapsed=true]/shell:mt-1.5 rail:group-data-[collapsed=true]/shell:border-b rail:group-data-[collapsed=true]/shell:border-zinc-200 dark:rail:group-data-[collapsed=true]/shell:border-zinc-800">
        <GroupLabel>Work</GroupLabel>
        {/* TASK-1765 — first, because it is the only entry point to a workspace
            and therefore to its docs and tasks. Placement is provisional: the
            question of whether browsing or Cockpit is the natural landing screen
            is Butter's to answer after seeing it (TASK-1764). */}
        <Item to="/projects" icon="ti-folders" label="Projects" count={counts.projects} />
        <Item to="/cockpit" icon="ti-layout-kanban" label="Cockpit" count={counts.cockpit} />
        <Item
          to="/conversations"
          icon="ti-messages"
          label="Conversations"
          count={counts.conversations}
        />
      </div>

      <div className="mb-3.5 rail:group-data-[collapsed=true]/shell:mb-0 rail:group-data-[collapsed=true]/shell:pb-1.5 rail:group-data-[collapsed=true]/shell:mt-1.5 rail:group-data-[collapsed=true]/shell:border-b rail:group-data-[collapsed=true]/shell:border-zinc-200 dark:rail:group-data-[collapsed=true]/shell:border-zinc-800">
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setOpen((v) => !v)}
          className={[
            "flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-sm text-left",
            "justify-center rail:justify-start rail:group-data-[collapsed=true]/shell:justify-center",
            insideKnowledge
              ? "text-zinc-900 dark:text-zinc-100 font-medium"
              : "text-zinc-600 dark:text-zinc-300",
            "hover:bg-zinc-50 dark:hover:bg-zinc-800/50",
          ].join(" ")}
        >
          <i
            className={`ti ti-chevron-down text-zinc-400 transition-transform hidden rail:inline rail:group-data-[collapsed=true]/shell:hidden ${
              expanded ? "" : "-rotate-90"
            }`}
            aria-hidden="true"
          />
          <i
            className={`ti ti-book-2 ${insideKnowledge ? "text-blue-600 dark:text-blue-400" : "text-zinc-400"}`}
            aria-hidden="true"
          />
          <span className="sr-only rail:not-sr-only rail:group-data-[collapsed=true]/shell:sr-only">Knowledge</span>
          <Count n={knowledgeTotal} />
        </button>

        {/* Collapsed children leave the accessibility tree entirely — hidden
            links a screen reader can still tab to are worse than no links. */}
        {expanded && (
          <div className="rail:ml-4 rail:pl-3 rail:border-l rail:group-data-[collapsed=true]/shell:ml-0 rail:group-data-[collapsed=true]/shell:pl-0 rail:group-data-[collapsed=true]/shell:border-l-0 border-zinc-200 dark:border-zinc-800">
            <Item
              to="/knowledge"
              icon="ti-database"
              label="Choda knowledge"
              count={counts.knowledge}
            />
            <Item to="/vault" icon="ti-notebook" label="Vault" count={counts.vault} />
          </div>
        )}
      </div>

      <div className="rail:group-data-[collapsed=true]/shell:mt-1.5">
        <GroupLabel>System</GroupLabel>
        {/* Graph is an inspector over both stores, not a third place to read. */}
        <Item to="/graph" icon="ti-share" label="Graph" />
        <Item to="/sync" icon="ti-refresh" label="Sync" />
      </div>
    </nav>
  );
}
