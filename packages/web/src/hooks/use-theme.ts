// TASK-2482 — the theme chosen in the sidebar foot: Auto, Light or Dark.
//
// The storage contract is the one packages/web/index.html already reads before
// first paint: `localStorage.theme` is "light" or "dark", and an ABSENT key
// means Auto (follow the OS). Keeping that contract is what makes a restart open
// in the chosen theme with no flash — the boot script applies it before React
// has loaded.
//
// In Auto a Windows theme change applies live through the
// `prefers-color-scheme` media query. In Light or Dark the OS is ignored.
//
// In the packaged app the choice is also sent to main (preload `setTheme`) so
// the native title bar follows. The browser shell has no bridge; the page
// theme still works there.

import { useCallback, useEffect, useState } from "react";

export type ThemeMode = "auto" | "light" | "dark";

export const THEME_MODES: readonly ThemeMode[] = ["auto", "light", "dark"];

const STORAGE_KEY = "theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

interface ThemeBridge {
  setTheme: (mode: "system" | "light" | "dark") => Promise<{ ok: boolean; reason?: string }>;
}

function bridge(): ThemeBridge | null {
  const w = window as unknown as { choda?: Partial<ThemeBridge> };
  return typeof w.choda?.setTheme === "function" ? (w.choda as ThemeBridge) : null;
}

function readStored(): ThemeMode {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === "light" || raw === "dark" ? raw : "auto";
  } catch {
    return "auto";
  }
}

function osPrefersDark(): boolean {
  if (typeof window.matchMedia !== "function") return false;
  return window.matchMedia(DARK_QUERY).matches;
}

function apply(mode: ThemeMode): void {
  const dark = mode === "dark" || (mode === "auto" && osPrefersDark());
  document.documentElement.classList.toggle("dark", dark);
}

function persist(mode: ThemeMode): void {
  try {
    if (mode === "auto") window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Storage disabled: the choice still applies for this run.
  }
}

function syncNative(mode: ThemeMode): void {
  bridge()
    ?.setTheme(mode === "auto" ? "system" : mode)
    .catch(() => {
      // The title bar is cosmetic; a failed IPC must not break the click.
    });
}

export interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

export function useTheme(): ThemeState {
  const [mode, setModeState] = useState<ThemeMode>(readStored);

  // Re-apply on mount and on every change. Also tells main once at startup, so
  // a userData file that drifted from localStorage (a dev run, a wiped profile)
  // is corrected rather than trusted.
  useEffect(() => {
    apply(mode);
    syncNative(mode);
  }, [mode]);

  useEffect(() => {
    if (mode !== "auto" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(DARK_QUERY);
    const onChange = (): void => apply("auto");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mode]);

  const setMode = useCallback((next: ThemeMode) => {
    persist(next);
    setModeState(next);
  }, []);

  return { mode, setMode };
}

/** The mode after `mode` in the collapsed-rail cycle: Auto → Light → Dark → Auto. */
export function nextThemeMode(mode: ThemeMode): ThemeMode {
  return mode === "auto" ? "light" : mode === "light" ? "dark" : "auto";
}
