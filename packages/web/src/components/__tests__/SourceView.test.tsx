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
import { lineFromHash } from "../SourceView";

const CSHARP = `public class Order {
    // a comment
    public string Name { get; set; } = "unnamed";
}`;

const PLAIN = "just some words\nand a second line";

function mount(path: string, code = CSHARP, lines: number[] = []): void {
  render(<SourceView path={path} code={code} highlightLines={new Set(lines)} />);
}

const pre = (): HTMLElement => screen.getByTestId("doc-source");
// TASK-1792 made highlighting PER LINE, so the marker moved from one element
// for the file to one per line. Measured before committing to it: on a real
// 2,048-line C# file the per-line pass costs 16.1 ms against 11.8 ms for the
// whole file — 1.4x, and both imperceptible. The trade buys markup that cannot
// be torn by a span crossing a line boundary.
const highlighted = (): Promise<HTMLElement> =>
  waitFor(() => screen.getByTestId("source-line-html-1"));

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
    await highlighted();
    const all = screen.getByTestId("doc-source").innerHTML;
    expect(all).toContain("hljs-keyword");
    expect(all).toContain("hljs-comment");
    // The text itself must survive intact — highlighting is decoration.
    expect(screen.getByTestId("doc-source").textContent).toContain("public class Order");
  });

  it("CONTROL — a .txt renders with no highlight markup at all (AC-1)", async () => {
    mount("notes.txt", PLAIN);
    await waitFor(() => expect(pre().textContent).toContain("just some words"));
    // A build that wrapped everything in <span class="hljs-…"> would pass the
    // test above and be wrong about every plain file.
    expect(screen.queryByTestId("source-line-html-1")).toBeNull();
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
    expect(screen.queryByTestId("source-line-html-1")).toBeNull();
  });

  it("escapes markup that came from the FILE (AC-6 safety)", async () => {
    // highlight.js escapes its input, so a file containing a script tag must
    // arrive as text. Asserting it here means a future swap of highlighter
    // cannot quietly lose that property.
    mount("page.html", "<script>alert(1)</script>");
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

  it("CONTROL — a .cs DOES reach it, once per line", async () => {
    // Without this, the assertion above passes on a build where highlighting
    // was never wired at all.
    //
    // This asserted "exactly once" before TASK-1792, when the whole file went
    // through in one call. It is now once per line, and saying so is more
    // honest than loosening it to "at least once": if the count ever stops
    // tracking the line count, something changed that this test should notice.
    const lib = await import("../../lib/highlight");
    const spy = vi.spyOn(lib, "highlight");
    mount("src/Order.cs");
    const lineCount = CSHARP.split(String.fromCharCode(10)).length;
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(lineCount));
    expect(spy.mock.calls[0]?.[1]).toBe("csharp");
  });
});

// TASK-1792 — line numbers and the anchor that lets a commit point at one.
describe("line numbers (AC-4)", () => {
  it("numbers every line, starting at 1", () => {
    mount("src/Order.cs");
    expect(screen.getByTestId("source-line-1")).toBeTruthy();
    // CSHARP is 4 lines; a trailing newline must not invent a fifth.
    expect(screen.getByTestId("source-line-4")).toBeTruthy();
    expect(screen.queryByTestId("source-line-5")).toBeNull();
  });

  it("gives each line an id an anchor can address", () => {
    mount("src/Order.cs");
    expect(screen.getByTestId("source-line-3").getAttribute("id")).toBe("L3");
  });

  it("marks the line it was asked to mark", () => {
    mount("src/Order.cs", CSHARP, [3]);
    expect(screen.getByTestId("source-line-3").getAttribute("data-marked")).toBe("true");
  });

  // TASK-1794 — the set-valued API. The old prop took ONE number, so a commit
  // that changed 13 lines marked 1 and the rest looked untouched.
  it("marks EVERY line in the set, not just the lowest", () => {
    mount("src/Order.cs", CSHARP, [2, 4]);
    expect(screen.getByTestId("source-line-2").getAttribute("data-marked")).toBe("true");
    expect(screen.getByTestId("source-line-4").getAttribute("data-marked")).toBe("true");
    expect(screen.getByTestId("source-line-3").getAttribute("data-marked")).toBeNull();
  });

  it("CONTROL — with no line asked for, nothing is marked", () => {
    // A viewer that highlighted something always would pass the test above and
    // point every reader at the same wrong line.
    mount("src/Order.cs");
    expect(screen.getByTestId("source-line-3").getAttribute("data-marked")).toBeNull();
    expect(screen.getByTestId("source-line-1").getAttribute("data-marked")).toBeNull();
  });

  it("marks only the lines asked for, not a range around them", () => {
    mount("src/Order.cs", CSHARP, [2]);
    expect(screen.getByTestId("source-line-2").getAttribute("data-marked")).toBe("true");
    expect(screen.getByTestId("source-line-1").getAttribute("data-marked")).toBeNull();
    expect(screen.getByTestId("source-line-3").getAttribute("data-marked")).toBeNull();
  });
});

describe("lineFromHash", () => {
  it("reads #L42", () => {
    expect(lineFromHash("#L42")).toBe(42);
  });

  it("refuses anything that is not a line reference", () => {
    // Returning 0 or NaN here would mark a line that does not exist, or throw
    // inside a render.
    for (const bad of ["", "#", "#L", "#L0", "#Lx", "#section", "#L-3"]) {
      expect(lineFromHash(bad), bad).toBeNull();
    }
  });
});
