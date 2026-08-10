// TASK-1626 — the collapsed state has two sources and they can disagree.
// These pin the resolution, because "which wins" is the whole design.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSidebar } from "../use-sidebar";

const KEY = "sidebar-collapsed";

/** Drive the rail breakpoint the way a real resize would. */
function mockViewport(narrow: boolean) {
  const listeners = new Set<(e: MediaQueryListEvent) => void>();
  const mql = {
    matches: narrow,
    media: "(max-width: 859px)",
    addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => listeners.delete(cb),
  };
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue(mql));
  return {
    resizeTo(nowNarrow: boolean) {
      mql.matches = nowNarrow;
      act(() => listeners.forEach((cb) => cb({ matches: nowNarrow } as MediaQueryListEvent)));
    },
  };
}

describe("useSidebar", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("starts COLLAPSED with no stored preference", () => {
    // Butter's call: the rail carries every destination, so the default spends
    // the width on content rather than on labels.
    mockViewport(false);
    const { result } = renderHook(() => useSidebar());
    expect(result.current.collapsed).toBe(true);
    expect(result.current.forcedByViewport).toBe(false);
  });

  it("distinguishes an absent preference from an explicit expanded one", () => {
    // The asymmetry that makes the default safe: absent means collapsed, but
    // someone who expanded it once keeps that choice across reloads. A hook
    // that treated both as "not true" would silently undo the user every time.
    localStorage.setItem(KEY, "false");
    mockViewport(false);
    const { result } = renderHook(() => useSidebar());
    expect(result.current.collapsed).toBe(false);
  });

  it("toggles and persists the preference", () => {
    mockViewport(false);
    const { result } = renderHook(() => useSidebar());
    // Default is collapsed, so the first toggle expands.
    act(() => result.current.toggle());
    expect(result.current.collapsed).toBe(false);
    expect(localStorage.getItem(KEY)).toBe("false");
    act(() => result.current.toggle());
    expect(result.current.collapsed).toBe(true);
    expect(localStorage.getItem(KEY)).toBe("true");
  });

  it("restores a stored preference on mount", () => {
    localStorage.setItem(KEY, "true");
    mockViewport(false);
    const { result } = renderHook(() => useSidebar());
    expect(result.current.collapsed).toBe(true);
  });

  it("lets the VIEWPORT win over a stored expanded preference", () => {
    // The point of the hook. A 216px sidebar in a 700px window would push the
    // content off-screen, so a narrow viewport collapses regardless of what
    // was stored.
    localStorage.setItem(KEY, "false");
    mockViewport(true);
    const { result } = renderHook(() => useSidebar());
    expect(result.current.collapsed).toBe(true);
    expect(result.current.forcedByViewport).toBe(true);
  });

  it("remembers the preference rather than obeying it — expanding again when there is room", () => {
    localStorage.setItem(KEY, "false");
    const vp = mockViewport(true);
    const { result } = renderHook(() => useSidebar());
    expect(result.current.collapsed).toBe(true); // forced

    vp.resizeTo(false);

    // The stored "expanded" was never overwritten by the forced collapse, so
    // widening the window restores it. A hook that wrote the forced state back
    // to storage would stay collapsed here.
    expect(result.current.collapsed).toBe(false);
    expect(localStorage.getItem(KEY)).toBe("false");
  });

  it("survives storage being unavailable", () => {
    // Private mode. A sidebar that throws on load is worse than one that
    // forgets.
    mockViewport(false);
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    const { result } = renderHook(() => useSidebar());
    expect(result.current.collapsed).toBe(true); // falls back to the default
    act(() => result.current.toggle());
    expect(result.current.collapsed).toBe(false);
    getItem.mockRestore();
    setItem.mockRestore();
  });
});
