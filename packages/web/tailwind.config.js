import typography from "@tailwindcss/typography";
import animate from "tailwindcss-animate";

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // TASK-1595 AC-7 — the sidebar collapses to an icon rail below this.
      // Named rather than an arbitrary `max-[860px]:` so the threshold lives in
      // one place; Tailwind is mobile-first, so `rail:` means "≥860px, expanded"
      // and the un-prefixed class is the rail itself.
      screens: {
        rail: "860px",
      },
      fontFamily: {
        sans: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["ui-monospace", "SF Mono", "Cascadia Mono", "Menlo", "monospace"],
      },
      // TASK-1595 — `maxWidth.page: "1024px"` removed here. It came from
      // TASK-857 and was the direct cause of the cramped two-pane views and
      // their calc() clamps. The shell now owns width; content panes set their
      // own max-width where prose readability calls for it.
      // TASK-1593 — shadcn's semantic colour names, resolved from the CSS
      // variables in index.css. Additive: every existing `zinc-*` / `blue-*`
      // utility keeps working, because this extends the palette instead of
      // replacing it.
      colors: {
        border: "rgb(var(--border) / <alpha-value>)",
        input: "rgb(var(--input) / <alpha-value>)",
        ring: "rgb(var(--ring) / <alpha-value>)",
        background: "rgb(var(--background) / <alpha-value>)",
        foreground: "rgb(var(--foreground) / <alpha-value>)",
        primary: {
          DEFAULT: "rgb(var(--primary) / <alpha-value>)",
          foreground: "rgb(var(--primary-foreground) / <alpha-value>)",
        },
        secondary: {
          DEFAULT: "rgb(var(--secondary) / <alpha-value>)",
          foreground: "rgb(var(--secondary-foreground) / <alpha-value>)",
        },
        destructive: {
          DEFAULT: "rgb(var(--destructive) / <alpha-value>)",
          foreground: "rgb(var(--destructive-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "rgb(var(--muted) / <alpha-value>)",
          foreground: "rgb(var(--muted-foreground) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "rgb(var(--accent) / <alpha-value>)",
          foreground: "rgb(var(--accent-foreground) / <alpha-value>)",
        },
        popover: {
          DEFAULT: "rgb(var(--popover) / <alpha-value>)",
          foreground: "rgb(var(--popover-foreground) / <alpha-value>)",
        },
        card: {
          DEFAULT: "rgb(var(--card) / <alpha-value>)",
          foreground: "rgb(var(--card-foreground) / <alpha-value>)",
        },
      },
      // NOTE: shadcn's scaffold normally remaps borderRadius to
      // lg/md/sm = calc(--radius ± 2px). That is deliberately NOT done here.
      // This app uses `rounded-md` in 41 places, `rounded` in 27 and
      // `rounded-sm` in 1; remapping the scale would shift every one of them
      // and break this task's no-visual-change invariant. `--radius` is still
      // defined in index.css for components that reference it directly.
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [typography, animate],
};
