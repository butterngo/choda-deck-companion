// TASK-1626 — the sidebar's collapsed state, which has two independent sources.
//
// TASK-1595 gave it an automatic rail below 860px. Butter asked for a manual
// toggle on top of that, which raises the question the whole hook exists to
// answer: what happens when the two disagree?
//
//   expanded  ⟺  viewport ≥ 860px  AND  not manually collapsed
//
// The viewport wins. Below 860px there is nothing to expand into, so honouring
// a stored "expanded" would put a 216px sidebar in a 700px window and push the
// content off-screen. The preference is remembered, not obeyed — flip back to a
// wide window and it comes back expanded.

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "sidebar-collapsed";

/** Must match `screens.rail` in tailwind.config.js. */
const RAIL_QUERY = "(max-width: 859px)";

/**
 * Collapsed by default (Butter's call). The rail carries every destination
 * already; the labels are a convenience, and the width is better spent on what
 * you came to read.
 *
 * Note the asymmetry: an ABSENT key means collapsed, but an explicit `"false"`
 * means expanded. A first-time user gets the rail; someone who has expanded it
 * once keeps that choice.
 */
const DEFAULT_COLLAPSED = true;

function readStored(): boolean {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return DEFAULT_COLLAPSED;
    return raw === "true";
  } catch {
    // Private mode, or storage disabled. A sidebar that throws on load is
    // worse than one that forgets.
    return DEFAULT_COLLAPSED;
  }
}

export interface SidebarState {
  /** What the sidebar actually renders as, after the viewport has its say. */
  collapsed: boolean;
  /** True when the viewport is forcing the rail, so the toggle cannot expand. */
  forcedByViewport: boolean;
  toggle: () => void;
}

export function useSidebar(): SidebarState {
  const [preference, setPreference] = useState<boolean>(readStored);
  const [narrow, setNarrow] = useState<boolean>(() => {
    // jsdom implements matchMedia only in newer versions and some test setups
    // stub it away; treating "no matchMedia" as "not narrow" keeps the desktop
    // default rather than collapsing every test render.
    if (typeof window.matchMedia !== "function") return false;
    return window.matchMedia(RAIL_QUERY).matches;
  });

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(RAIL_QUERY);
    const onChange = (e: MediaQueryListEvent): void => setNarrow(e.matches);
    mq.addEventListener("change", onChange);
    setNarrow(mq.matches);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const toggle = useCallback(() => {
    setPreference((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // Preference is a nicety; failing to persist must not break the click.
      }
      return next;
    });
  }, []);

  return {
    collapsed: preference || narrow,
    forcedByViewport: narrow,
    toggle,
  };
}
