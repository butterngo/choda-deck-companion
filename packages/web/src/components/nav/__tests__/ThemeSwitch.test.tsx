// TASK-2482 AC-1 / AC-7 — the control itself, expanded and on the rail.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { ThemeSwitch } from "../ThemeSwitch";

describe("ThemeSwitch", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("renders three radios with Auto checked on a fresh profile", () => {
    render(<ThemeSwitch collapsed={false} />);
    const group = screen.getByRole("radiogroup", { name: "Theme" });
    const radios = within(group).getAllByRole("radio");
    expect(radios.map((r) => r.textContent)).toEqual(["Auto", "Light", "Dark"]);
    expect(within(group).getByRole("radio", { name: "Auto" })).toHaveAttribute("aria-checked", "true");
    expect(within(group).getByRole("radio", { name: "Dark" })).toHaveAttribute("aria-checked", "false");
  });

  it("checks the clicked radio and applies it", () => {
    render(<ThemeSwitch collapsed={false} />);
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(screen.getByRole("radio", { name: "Dark" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Auto" })).toHaveAttribute("aria-checked", "false");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("collapsed, is one button that cycles and names the current mode", () => {
    render(<ThemeSwitch collapsed />);
    expect(screen.queryByRole("radiogroup")).toBeNull();
    const button = screen.getByTestId("theme-cycle");
    expect(button).toHaveAccessibleName(/^Theme: Auto\./);

    fireEvent.click(button);
    expect(button).toHaveAccessibleName(/^Theme: Light\./);
    expect(localStorage.getItem("theme")).toBe("light");

    fireEvent.click(button);
    expect(button).toHaveAccessibleName(/^Theme: Dark\./);
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    fireEvent.click(button);
    expect(button).toHaveAccessibleName(/^Theme: Auto\./);
    expect(localStorage.getItem("theme")).toBeNull();
  });
});
