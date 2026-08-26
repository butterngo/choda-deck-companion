// TASK-1789 — syntax highlighting for the file viewer.
//
// highlight.js, one dynamic import per language, exactly as mermaid is loaded
// (TASK-1781). The choice was measured, not preferred: against shiki, the same
// languages cost 22–27× more per grammar (javascript 174.9 kB vs 6.6 kB,
// csharp 90.2 kB vs 4.1 kB) and shiki additionally pulls 622 kB of oniguruma
// WASM. For a read-only local viewer on an installer already near 196 MB, that
// is not a proportionate trade.
//
// What it costs us: highlight.js has NO Razor grammar, so `.cshtml` highlights
// as markup — correct HTML, uncoloured `@` blocks. Accepted deliberately: 139
// .cshtml files against 2,410 .cs where hljs is 22× cheaper. `EXT_TO_LANGUAGE`
// records that mapping so it reads as a decision rather than an oversight.

import type { HLJSApi } from "highlight.js";

/**
 * Extension → highlight.js language id.
 *
 * Only languages actually present in the registered workspaces are here. Adding
 * one is a line plus a lazy import; shipping grammars nobody opens is weight in
 * the asar for nothing.
 */
const EXT_TO_LANGUAGE: Record<string, string> = {
  // The big one — 2,410 files in ABC.
  cs: "csharp",
  // Razor has no highlight.js grammar. Markup is the honest degradation: the
  // HTML colours correctly and the @-blocks do not. NOT a silent fallback —
  // see the note at the top of this file.
  cshtml: "xml",
  razor: "xml",

  sql: "sql",
  css: "css",
  scss: "scss",
  less: "less",

  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "javascript",
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "typescript",

  html: "xml",
  htm: "xml",
  xml: "xml",
  svg: "xml",
  csproj: "xml",
  config: "xml",

  json: "json",
  yaml: "yaml",
  yml: "yaml",
  toml: "ini",
  ini: "ini",

  sh: "bash",
  bash: "bash",
  zsh: "bash",
  ps1: "powershell",

  md: "markdown",
  py: "python",
  go: "go",
  rs: "rust",
  java: "java",
  rb: "ruby",
  php: "php",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  h: "cpp",
  hpp: "cpp",
  c: "c",
  dockerfile: "dockerfile",
};

/** The language id for a path, or null when nothing should be loaded. */
export function languageFor(path: string): string | null {
  const name = path.split("/").pop() ?? path;
  if (name.toLowerCase() === "dockerfile") return "dockerfile";
  const dot = name.lastIndexOf(".");
  if (dot < 0) return null;
  return EXT_TO_LANGUAGE[name.slice(dot + 1).toLowerCase()] ?? null;
}

/**
 * Loaders are declared statically so the bundler can see every one and emit a
 * chunk per language. A computed `import(\`highlight.js/lib/languages/${id}\`)`
 * would make Vite bundle ALL of them into one chunk — which is the failure this
 * whole file exists to avoid, and it would not show up as an error anywhere.
 */
const LOADERS: Record<string, () => Promise<{ default: unknown }>> = {
  csharp: () => import("highlight.js/lib/languages/csharp"),
  sql: () => import("highlight.js/lib/languages/sql"),
  css: () => import("highlight.js/lib/languages/css"),
  scss: () => import("highlight.js/lib/languages/scss"),
  less: () => import("highlight.js/lib/languages/less"),
  javascript: () => import("highlight.js/lib/languages/javascript"),
  typescript: () => import("highlight.js/lib/languages/typescript"),
  xml: () => import("highlight.js/lib/languages/xml"),
  json: () => import("highlight.js/lib/languages/json"),
  yaml: () => import("highlight.js/lib/languages/yaml"),
  ini: () => import("highlight.js/lib/languages/ini"),
  bash: () => import("highlight.js/lib/languages/bash"),
  powershell: () => import("highlight.js/lib/languages/powershell"),
  markdown: () => import("highlight.js/lib/languages/markdown"),
  python: () => import("highlight.js/lib/languages/python"),
  go: () => import("highlight.js/lib/languages/go"),
  rust: () => import("highlight.js/lib/languages/rust"),
  java: () => import("highlight.js/lib/languages/java"),
  ruby: () => import("highlight.js/lib/languages/ruby"),
  php: () => import("highlight.js/lib/languages/php"),
  cpp: () => import("highlight.js/lib/languages/cpp"),
  c: () => import("highlight.js/lib/languages/c"),
  dockerfile: () => import("highlight.js/lib/languages/dockerfile"),
};

let corePromise: Promise<HLJSApi> | null = null;
const registered = new Set<string>();

/** The core, loaded at most once for the life of the page. */
async function core(): Promise<HLJSApi> {
  corePromise ??= import("highlight.js/lib/core").then((m) => m.default);
  return corePromise;
}

/**
 * Highlight `code` as `language`, returning HTML.
 *
 * Returns null rather than throwing when the language is unknown or the grammar
 * fails: the viewer's job is the text, and colour is decoration on top of it. A
 * caller that got an exception here would have to choose between a blank pane
 * and its own try/catch, and one of those is always chosen wrongly.
 */
export async function highlight(code: string, language: string): Promise<string | null> {
  const load = LOADERS[language];
  if (!load) return null;
  try {
    const hljs = await core();
    if (!registered.has(language)) {
      const mod = await load();
      hljs.registerLanguage(language, mod.default as never);
      registered.add(language);
    }
    return hljs.highlight(code, { language, ignoreIllegals: true }).value;
  } catch {
    return null;
  }
}

/** Test seam — the module-level caches would otherwise leak between cases. */
export function resetHighlightCacheForTests(): void {
  corePromise = null;
  registered.clear();
}
