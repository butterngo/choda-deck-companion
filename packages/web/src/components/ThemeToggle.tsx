import { useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

function readStored(): Theme {
  try {
    const v = localStorage.getItem("theme");
    if (v === "light" || v === "dark") return v;
  } catch {
    /* ignore */
  }
  return "system";
}

function apply(theme: Theme) {
  const systemDark =
    window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = theme === "dark" || (theme === "system" && systemDark);
  document.documentElement.classList.toggle("dark", dark);
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(readStored);

  useEffect(() => {
    apply(theme);
    try {
      if (theme === "system") localStorage.removeItem("theme");
      else localStorage.setItem("theme", theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const next: Theme =
    theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
  const icon =
    theme === "light" ? "ti-sun" : theme === "dark" ? "ti-moon" : "ti-device-desktop";

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      className="text-[14px] text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
      title={`Theme: ${theme} (click → ${next})`}
      aria-label={`Theme: ${theme}`}
    >
      <i className={`ti ${icon}`} aria-hidden="true" />
    </button>
  );
}
