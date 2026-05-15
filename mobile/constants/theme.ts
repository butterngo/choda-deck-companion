// Tailwind zinc + semantic palette per docs/handoff-design/project/uploads/UI.md.
// Light/dark mappings mirror the design system tokens.

import { Platform } from 'react-native';

export const Colors = {
  light: {
    // Surfaces
    background: '#ffffff', // page
    surface: '#fafafa', // zinc-50 — card, expanded row
    surfaceMuted: '#f4f4f5', // zinc-100 — pill bg
    border: '#e4e4e7', // zinc-200 — hairline 0.5px

    // Text
    text: '#18181b', // zinc-900
    textMuted: '#71717a', // zinc-500
    textSubtle: '#a1a1aa', // zinc-400

    // Semantic
    success: '#16a34a', // green-600
    inProgress: '#2563eb', // blue-600
    queued: '#71717a', // zinc-500
    danger: '#dc2626', // red-600
    cancelled: '#a1a1aa', // zinc-400
    livePulse: '#22c55e', // green-500

    // Pill chips
    chipBg: '#f4f4f5', // zinc-100
    chipText: '#3f3f46', // zinc-700
    chipBgActive: '#18181b', // zinc-900
    chipTextActive: '#ffffff',

    // Inputs
    inputBg: '#fafafa',
    inputBorder: '#e4e4e7',

    // Priority dots
    priorityCritical: '#ef4444', // red-500
    priorityHigh: '#f59e0b', // amber-500
    priorityMedium: '#a1a1aa', // zinc-400

    // Tabs
    tint: '#18181b', // active tab marker
    icon: '#71717a',
    tabIconDefault: '#71717a',
    tabIconSelected: '#18181b',
  },
  dark: {
    background: '#18181b', // zinc-900
    surface: '#27272a', // zinc-800
    surfaceMuted: '#27272a',
    border: '#3f3f46', // zinc-700

    text: '#fafafa', // zinc-50
    textMuted: '#a1a1aa', // zinc-400
    textSubtle: '#71717a', // zinc-500

    success: '#4ade80', // green-400
    inProgress: '#60a5fa', // blue-400
    queued: '#a1a1aa',
    danger: '#f87171', // red-400
    cancelled: '#71717a',
    livePulse: '#22c55e',

    chipBg: '#27272a',
    chipText: '#d4d4d8', // zinc-300
    chipBgActive: '#fafafa',
    chipTextActive: '#18181b',

    inputBg: '#27272a',
    inputBorder: '#3f3f46',

    priorityCritical: '#f87171',
    priorityHigh: '#fbbf24',
    priorityMedium: '#71717a',

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
    mono: 'ui-monospace, "SF Mono", "Cascadia Mono", Menlo, monospace',
  },
})!;
