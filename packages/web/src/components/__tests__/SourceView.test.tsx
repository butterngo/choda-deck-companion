// TASK-1789 — syntax highlighting in the file viewer.
//
// highlight.js is NOT mocked. Its grammars are the thing under test: a mock
// would only prove the wiring calls something, and "does a .cs actually
// colour" is the question. The real cost is a few kB per language in a test
// process, which is cheap next to an assertion that cannot fail.
//
// What IS instrumented is the language-loading seam, because "which chunk gets
// pulled, and how often" is a property no rendering assertion can see.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { SourceView } from "../SourceView";
import { languageFor, resetHighlightCacheForTests } from "../../lib/highlight";

const CSHARP = `public class Order {
    // a comment
    public string Name { get; set; } = "unnamed";
}`;

const PLAIN = "just some words\nand a second line";

function mount(path: string, code = CSHARP): void {
  render(<SourceView path={path} code={code} />);
}

const pre = (): HTMLElement => screen.getByTestId("doc-source");
const highlighted = (): Promise<HTMLElement> =>
  waitFor(() => screen.getByTestId("doc-source-highlighted"));

beforeEach(() => {
  resetHighlightCacheForTests();
  vi.restoreAllMocks();
});

describe("languageFor", () => {
  it("maps the extensions these workspaces actually contain (AC-4)", () => {
    // Counted, not guessed: .cs 2410, .js 517, .sql 403, .css 267 in ABC alone.
    const cases: Array<[string, string]> = [
      ["src/Order.cs", "csharp"],
      ["db/migrate.sql", "sql"],
      ["site.css", "css"],
      ["app.js", "javascript"],
      ["app.ts", "typescript"],
      ["App.tsx", "typescript"],
      ["page.html", "xml"],
      ["data.json", "json"],
      ["ci.yaml", "yaml"],
      ["ci.yml", "yaml"],
      ["Api.csproj", "xml"],
      ["run.sh", "bash"],
      ["notes.md", "markdown"],
      ["addon.cpp", "cpp"],
      ["addon.h", "cpp"],
    ];
    for (const [path, lang] of cases) {
      expect(languageFor(path), path).toBe(lang);
    }
  });

  it("returns null for a file with nothing to highlight — the control", () => {
    // Without this, a mapping that returned "javascript" for everything would
    // satisfy every line above.
    expect(languageFor("notes.txt")).toBeNull();
    expect(languageFor("LICENSE")).toBeNull();
    expect(languageFor("data.bin")).toBeNull();
  });

  it("recognises Dockerfile, which has no extension at all", () => {
    expect(languageFor("build/Dockerfile")).toBe("dockerfile");
  });

  it("maps .cshtml to markup, and says so rather than pretending it is C# (AC-5)", () => {
    // highlight.js has no Razor grammar. The HTML colours; the @-blocks do not.
    // Accepted: 139 .cshtml against 2,410 .cs where hljs is 22x cheaper than
    // the alternative that does have Razor.
    expect(languageFor("Views/Index.cshtml")).toBe("xml");
  });
});

describe("rendering", () => {
  it("colours a C# file (AC-1)", async () => {
    mount("src/Order.cs");
    const code = await highlighted();
    expect(code.innerHTML).toContain("hljs-keyword");
    expect(code.innerHTML).toContain("hljs-comment");
    // The text itself must survive intact — highlighting is decoration.
    expect(code.textContent).toContain("public class Order");
  });

  it("CONTROL — a .txt renders with no highlight markup at all (AC-1)", async () => {
    mount("notes.txt", PLAIN);
    await waitFor(() => expect(pre().textContent).toContain("just some words"));
    // A build that wrapped everything in <span class="hljs-…"> would pass the
    // test above and be wrong about every plain file.
    expect(screen.queryByTestId("doc-source-highlighted")).toBeNull();
    expect(pre().innerHTML).not.toContain("hljs-");
  });

  it("shows the text before any grammar arrives", () => {
    // Rendered synchronously, before the async highlight resolves. A viewer
    // that waited would blank the pane on a slow chunk.
    mount("src/Order.cs");
    expect(pre().textContent).toContain("public class Order");
  });

  it("records the resolved language on the element, for both cases", async () => {
    mount("src/Order.cs");
    await highlighted();
    expect(pre().getAttribute("data-language")).toBe("csharp");
  });

  it("keeps showing the text when highlighting fails (AC-6)", async () => {
    // The viewer's job is the text. Colour is decoration on top of it.
    const lib = await import("../../lib/highlight");
    vi.spyOn(lib, "highlight").mockRejectedValue(new Error("grammar exploded"));
    mount("src/Order.cs");
    await waitFor(() => expect(pre().textContent).toContain("public class Order"));
    expect(screen.queryByTestId("doc-source-highlighted")).toBeNull();
  });

  it("escapes markup that came from the FILE (AC-6 safety)", async () => {
    // highlight.js escapes its input, so a file containing a script tag must
    // arrive as text. Asserting it here means a future swap of highlighter
    // cannot quietly lose that property.
    mount("page.html", '<script>alert(1)</script>');
    await highlighted();
    expect(pre().querySelector("script")).toBeNull();
    expect(pre().textContent).toContain("<script>alert(1)</script>");
  });
});

describe("what gets loaded (AC-2, AC-3)", () => {
  it("does not reach the highlighter for a file with no language", async () => {
    const lib = await import("../../lib/highlight");
    const spy = vi.spyOn(lib, "highlight");
    mount("notes.txt", PLAIN);
    await waitFor(() => expect(pre().textContent).toContain("just some words"));
    expect(spy).not.toHaveBeenCalled();
  });

  it("CONTROL — a .cs DOES reach it exactly once", async () => {
    // Without this, the assertion above passes on a build where highlighting
    // was never wired at all.
    const lib = await import("../../lib/highlight");
    const spy = vi.spyOn(lib, "highlight");
    mount("src/Order.cs");
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(spy.mock.calls[0]?.[1]).toBe("csharp");
  });
});
