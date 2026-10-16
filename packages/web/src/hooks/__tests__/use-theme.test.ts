// TASK-2482 AC-2 / AC-4 — the theme hook. The storage contract is the one the
// index.html boot script reads, so these pin the exact key and values.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { nextThemeMode, useTheme } from "../use-theme";

/** Drive `prefers-color-scheme` the way a Windows theme change would. */
function mockOs(dark: boolean) {
  const listeners = new Set<(e: MediaQueryListEvent) => void>();
  const mql = {
    matches: dark,
    media: "(prefers-color-scheme: dark)",
    addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => listeners.delete(cb),
  };
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue(mql));
  return {
    switchTo(nowDark: boolean) {
      mql.matches = nowDark;
      act(() => listeners.forEach((cb) => cb({ matches: nowDark } as MediaQueryListEvent)));
    },
  };
}

const isDark = (): boolean => document.documentElement.classList.contains("dark");

describe("useTheme", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
    vi.unstubAllGlobals();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete (window as unknown as { choda?: unknown }).choda;
  });

  it("defaults to Auto with no stored key and follows the OS", () => {
    mockOs(true);
    const { result } = renderHook(() => useTheme());
    expect(result.current.mode).toBe("auto");
    expect(isDark()).toBe(true);
  });

  it("Light and Dark toggle the class immediately and write the key", () => {
    mockOs(true);
    const { result } = renderHook(() => useTheme());

    act(() => result.current.setMode("light"));
    expect(isDark()).toBe(false);
    expect(localStorage.getItem("theme")).toBe("light");

    act(() => result.current.setMode("dark"));
    expect(isDark()).toBe(true);
    expect(localStorage.getItem("theme")).toBe("dark");
  });

  it("Auto removes the key and applies the OS theme", () => {
    mockOs(false);
    localStorage.setItem("theme", "dark");
    const { result } = renderHook(() => useTheme());
    expect(isDark()).toBe(true);

    act(() => result.current.setMode("auto"));
    expect(localStorage.getItem("theme")).toBeNull();
    expect(isDark()).toBe(false);
  });

  it("an OS change flips the class live in Auto", () => {
    const os = mockOs(false);
    renderHook(() => useTheme());
    expect(isDark()).toBe(false);
    os.switchTo(true);
    expect(isDark()).toBe(true);
    os.switchTo(false);
    expect(isDark()).toBe(false);
  });

  it("an OS change is ignored in Light and in Dark", () => {
    const os = mockOs(false);
    const { result } = renderHook(() => useTheme());

    act(() => result.current.setMode("light"));
    os.switchTo(true);
    expect(isDark()).toBe(false);

    act(() => result.current.setMode("dark"));
    os.switchTo(false);
    expect(isDark()).toBe(true);
  });

  it("tells main the mode through the bridge, mapping Auto to system", () => {
    mockOs(false);
    const setTheme = vi.fn().mockResolvedValue({ ok: true });
    (window as unknown as { choda: unknown }).choda = { setTheme };
    const { result } = renderHook(() => useTheme());
    expect(setTheme).toHaveBeenLastCalledWith("system");

    act(() => result.current.setMode("dark"));
    expect(setTheme).toHaveBeenLastCalledWith("dark");
  });

  it("cycles Auto → Light → Dark → Auto", () => {
    expect(nextThemeMode("auto")).toBe("light");
    expect(nextThemeMode("light")).toBe("dark");
    expect(nextThemeMode("dark")).toBe("auto");
  });
});
