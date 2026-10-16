// TASK-2482 — Auto / Light / Dark in the sidebar foot (mockup approved
// 2026-10-15). Expanded, it is a three-option radiogroup. On the collapsed rail
// there is no width for three labels, so it becomes one icon button that cycles
// Auto → Light → Dark; its accessible name says which mode is current and what
// a click switches to.

import { THEME_MODES, nextThemeMode, useTheme, type ThemeMode } from "../../hooks/use-theme";

const META: Record<ThemeMode, { label: string; icon: string; title?: string }> = {
  auto: { label: "Auto", icon: "ti-device-desktop", title: "Follow Windows" },
  light: { label: "Light", icon: "ti-sun" },
  dark: { label: "Dark", icon: "ti-moon" },
};

export function ThemeSwitch({ collapsed }: { collapsed: boolean }): React.JSX.Element {
  const { mode, setMode } = useTheme();

  if (collapsed) {
    const next = nextThemeMode(mode);
    const name = `Theme: ${META[mode].label}. Switch to ${META[next].label}`;
    return (
      <button
        type="button"
        data-testid="theme-cycle"
        onClick={() => setMode(next)}
        aria-label={name}
        title={name}
        className="flex items-center justify-center px-2 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-800 text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
      >
        <i className={`ti ${META[mode].icon}`} aria-hidden="true" />
      </button>
    );
  }

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      data-testid="theme-switch"
      className="grid grid-cols-3 gap-0.5 p-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800"
    >
      {THEME_MODES.map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={mode === m}
          onClick={() => setMode(m)}
          title={META[m].title}
          className="flex items-center justify-center gap-1 py-1 rounded text-[11.5px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-100 aria-checked:bg-white dark:aria-checked:bg-zinc-700 aria-checked:text-zinc-900 dark:aria-checked:text-zinc-100 aria-checked:shadow-sm"
        >
          <i className={`ti ${META[m].icon}`} aria-hidden="true" />
          {META[m].label}
        </button>
      ))}
    </div>
  );
}
