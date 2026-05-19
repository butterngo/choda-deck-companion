// v2 design tokens per docs/handoff-design/project/uploads/00-product-overview.md §Design tokens.
// Tailwind shade names are exact; hex values match Tailwind v3 defaults.

import { Platform } from 'react-native';

export const Colors = {
  light: {
    // Surfaces
    surface: '#ffffff', // white — page background
    surfaceRaised: '#fafafa', // zinc-50 — cards, expanded rows
    surfaceMuted: '#f4f4f5', // zinc-100 — pill bg
    border: '#e4e4e7', // zinc-200 — hairline

    // Text
    text: '#18181b', // zinc-900
    textMuted: '#71717a', // zinc-500
    textSubtle: '#a1a1aa', // zinc-400

    // Accent — links, primary CTA, active chips
    accent: '#2563eb', // blue-600

    // Status — match handoff design system status tokens
    statusDone: '#059669', // emerald-600
    statusFailed: '#e11d48', // rose-600
    statusInProgress: '#d97706', // amber-600
    statusReady: '#0284c7', // sky-600
    statusTodo: '#71717a', // zinc-500
    statusCancelled: '#a1a1aa', // zinc-400

    // Semantic aliases consumed by outcomeColor() and legacy components.
    // Values intentionally mirror the v2 status tokens above.
    success: '#059669', // → statusDone
    danger: '#e11d48', // → statusFailed
    warning: '#d97706', // → statusInProgress (and SKIPPED_PREFLIGHT outcome tone)
    inProgress: '#d97706', // → statusInProgress
    queued: '#71717a', // → statusTodo
    cancelled: '#a1a1aa', // → statusCancelled
    livePulse: '#10b981', // emerald-500 — pulse halo

    // Pill chips
    chipBg: '#f4f4f5', // zinc-100
    chipText: '#3f3f46', // zinc-700
    chipBgActive: '#2563eb', // accent
    chipTextActive: '#ffffff',

    // Inputs
    inputBg: '#fafafa',
    inputBorder: '#e4e4e7',

    // Priority dots
    priorityCritical: '#e11d48', // rose-600
    priorityHigh: '#d97706', // amber-600
    priorityMedium: '#2563eb', // blue-600
    priorityLow: '#a1a1aa', // zinc-400

    // Tabs
    tint: '#18181b',
    icon: '#71717a',
    tabIconDefault: '#71717a',
    tabIconSelected: '#18181b',
  },
  dark: {
    surface: '#18181b', // zinc-900
    surfaceRaised: '#27272a', // zinc-800
    surfaceMuted: '#27272a',
    border: '#3f3f46', // zinc-700

    text: '#f4f4f5', // zinc-100
    textMuted: '#a1a1aa', // zinc-400
    textSubtle: '#71717a', // zinc-500

    accent: '#60a5fa', // blue-400

    statusDone: '#34d399', // emerald-400
    statusFailed: '#fb7185', // rose-400
    statusInProgress: '#fbbf24', // amber-400
    statusReady: '#38bdf8', // sky-400
    statusTodo: '#a1a1aa', // zinc-400
    statusCancelled: '#71717a', // zinc-500

    success: '#34d399',
    danger: '#fb7185',
    warning: '#fbbf24',
    inProgress: '#fbbf24',
    queued: '#a1a1aa',
    cancelled: '#71717a',
    livePulse: '#10b981',

    chipBg: '#27272a',
    chipText: '#d4d4d8', // zinc-300
    chipBgActive: '#60a5fa',
    chipTextActive: '#18181b',

    inputBg: '#27272a',
    inputBorder: '#3f3f46',

    priorityCritical: '#fb7185',
    priorityHigh: '#fbbf24',
    priorityMedium: '#60a5fa',
    priorityLow: '#71717a',

    tint: '#fafafa',
    icon: '#a1a1aa',
    tabIconDefault: '#a1a1aa',
    tabIconSelected: '#fafafa',
  },
};

export type Palette = (typeof Colors)[keyof typeof Colors];

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  },
})!;
