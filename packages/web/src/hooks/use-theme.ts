// TASK-2482 — the theme chosen in the sidebar foot: Auto, Light or Dark.
//
// Where the choice lives depends on the shell, and packages/web/index.html's
// boot script reads it the same way before first paint:
//
//   packaged app — main owns it (preload `setTheme` / `getTheme`, a file in
//     userData). localStorage cannot: the UI is served from 127.0.0.1 on a new
//     port every launch, so every launch is a new origin with empty storage.
//     Setting it there also makes the native title bar follow.
//   browser shell — `localStorage.theme` is "light" or "dark", and an ABSENT
//     key means Auto.
//
// In Auto a Windows theme change applies live through the
// `prefers-color-scheme` media query. In Light or Dark the OS is ignored.

import { useCallback, useEffect, useState } from "react";

export type ThemeMode = "auto" | "light" | "dark";

export const THEME_MODES: readonly ThemeMode[] = ["auto", "light", "dark"];

const STORAGE_KEY = "theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

type NativeMode = "system" | "light" | "dark";

interface ThemeBridge {
  setTheme: (mode: NativeMode) => Promise<{ ok: boolean; reason?: string }>;
  getTheme: () => NativeMode;
}

function bridge(): ThemeBridge | null {
  const w = window as unknown as { choda?: Partial<ThemeBridge> };
  return typeof w.choda?.setTheme === "function" && typeof w.choda.getTheme === "function"
    ? (w.choda as ThemeBridge)
    : null;
}

function readStored(): ThemeMode {
  try {
    const b = bridge();
    const raw = b ? b.getTheme() : window.localStorage.getItem(STORAGE_KEY);
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

  useEffect(() => {
    apply(mode);
  }, [mode]);

  useEffect(() => {
    if (mode !== "auto" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(DARK_QUERY);
    const onChange = (): void => apply("auto");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mode]);

  // Main is told only on a user choice, never on mount: at mount the mode was
  // just READ from main, and echoing it back is how a stale value would win.
  const setMode = useCallback((next: ThemeMode) => {
    persist(next);
    syncNative(next);
    setModeState(next);
  }, []);

  return { mode, setMode };
}

/** The mode after `mode` in the collapsed-rail cycle: Auto → Light → Dark → Auto. */
export function nextThemeMode(mode: ThemeMode): ThemeMode {
  return mode === "auto" ? "light" : mode === "light" ? "dark" : "auto";
}
