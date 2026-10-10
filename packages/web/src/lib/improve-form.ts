// TASK-2360 — the improve settings form as plain data. The form edits strings
// (a textarea of pages, a target typed as text); the adapter validates the real
// shape (choda-deck src/core/domain/improve/improve-config.ts). These two
// functions convert between them so that opening a saved config and saving it
// again changes nothing.

import type { CriterionBy, ImproveConfig, ImproveConfigIssue, ImproveMode } from "../api";

export interface FlowRow {
  name: string;
  steps: string;
  spec: string;
}

export interface CriterionRow {
  name: string;
  by: CriterionBy;
  measure: string;
  target: string;
  good: boolean;
}

export interface ImproveForm {
  url: string;
  startCmd: string;
  testCmd: string;
  pages: string;
  flows: FlowRow[];
  criteria: CriterionRow[];
  mode: ImproveMode;
  model: string;
  maxProposals: number;
  stopAfterFlat: number;
}

/** A workspace with no config starts here: Manual, the adapter's own defaults. */
export const NEW_FORM: ImproveForm = {
  url: "http://localhost:5173",
  startCmd: "",
  testCmd: "",
  pages: "/",
  flows: [],
  criteria: [],
  mode: "manual",
  model: "sonnet",
  maxProposals: 3,
  stopAfterFlat: 3,
};

export function formFromConfig(config: ImproveConfig | null): ImproveForm {
  if (config === null) return { ...NEW_FORM };
  return {
    url: config.url,
    startCmd: config.startCmd ?? "",
    testCmd: config.testCmd ?? "",
    pages: config.pages.join("\n"),
    flows: config.flows.map((f) => ({ name: f.name, steps: f.steps, spec: f.spec ?? "" })),
    criteria: config.criteria.map((c) => ({
      name: c.name,
      by: c.by,
      measure: c.measure,
      target: String(c.target),
      good: c.good === true,
    })),
    mode: config.mode,
    model: config.model,
    maxProposals: config.maxProposals,
    stopAfterFlat: config.stopAfterFlat,
  };
}

/** A target that reads as a number is saved as one: `0` console errors, not `"0"`. */
function parseTarget(t: string): string | number {
  const s = t.trim();
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : s;
}

export function configFromForm(form: ImproveForm): ImproveConfig {
  const config: ImproveConfig = {
    mode: form.mode,
    url: form.url.trim(),
    // In-memory textarea value; the browser normalises its newlines to \n.
    pages: form.pages.split("\n").map((p) => p.trim()).filter((p) => p !== ""),
    flows: form.flows.map((f) => ({
      name: f.name.trim(),
      steps: f.steps.trim(),
      ...(f.spec.trim() ? { spec: f.spec.trim() } : {}),
    })),
    criteria: form.criteria.map((c) => ({
      name: c.name.trim(),
      by: c.by,
      measure: c.measure.trim(),
      target: parseTarget(c.target),
      ...(c.good ? { good: true } : {}),
    })),
    model: form.model.trim(),
    maxProposals: form.maxProposals,
    stopAfterFlat: form.stopAfterFlat,
  };
  if (form.startCmd.trim()) config.startCmd = form.startCmd.trim();
  if (form.testCmd.trim()) config.testCmd = form.testCmd.trim();
  return config;
}

/** Field path → message. `pages[2]` folds into `pages`: the pages are one textarea. */
export function errorsByField(issues: ImproveConfigIssue[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const { field, message } of issues) {
    const key = field.startsWith("pages[") ? "pages" : field;
    if (!out.has(key)) out.set(key, field === key ? message : `${field}: ${message}`);
  }
  return out;
}

/** Quick-add chips. The measure of an `auto` one points at the first page. */
export function suggestedCriterion(chip: string, firstPage: string): CriterionRow {
  const page = firstPage || "/";
  switch (chip) {
    case "console":
      return { name: "Console errors", by: "auto", measure: `console:${page}`, target: "0", good: false };
    case "a11y":
      return { name: "Accessibility", by: "auto", measure: `axe:${page}`, target: "0", good: false };
    case "bundle":
      return { name: "Bundle size", by: "you", measure: "Size of the main JS chunk after build", target: "< 500 kB", good: false };
    case "copy":
      return {
        name: "Clear copy",
        by: "agent",
        measure: "Labels and messages are short, specific and say what happens next",
        target: "≥ 4/5",
        good: false,
      };
    default:
      return {
        name: "Works on mobile",
        by: "agent",
        measure: "At phone width nothing is cut off and nothing scrolls sideways",
        target: "≥ 4/5",
        good: false,
      };
  }
}

/** Rough evaluator cost per run: each agent criterion reads every page's screenshots. */
export function estimateTokens(form: ImproveForm): number {
  const agent = form.criteria.filter((c) => c.by === "agent").length;
  const pages = form.pages.split("\n").filter((p) => p.trim() !== "").length;
  return agent === 0 ? 0 : 4000 + agent * pages * 2 * 1600;
}
