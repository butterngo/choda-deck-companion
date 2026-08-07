// TASK-1593 — the `cn` helper every shadcn component expects. Merges
// conditional class lists (clsx) and then resolves Tailwind conflicts so a
// caller's `className` reliably wins over a component's defaults
// (tailwind-merge) — without it, `<Button className="px-2">` fights the
// variant's padding instead of replacing it.

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
