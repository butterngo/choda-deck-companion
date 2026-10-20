// TASK-2562 — the suite total and the test cases a commit added.

import { describe, it, expect } from "vitest";
import type { CommitFileStat, DiffLine } from "../../api";
import { addedTestCases, parseSuiteLine } from "../run-tests";

const PATH = "tests/A.Tests/PlatformTests.cs";

function line(kind: DiffLine["kind"], text: string): DiffLine {
  return { kind, text, oldNo: kind === "add" ? null : 1, newNo: kind === "del" ? null : 1 };
}

function file(lines: DiffLine[], path = PATH): CommitFileStat {
  return {
    path,
    hunks: [{ oldStart: 1, oldLines: 0, newStart: 1, newLines: lines.length, header: "", lines }],
    insertions: lines.length,
    deletions: 0,
    binary: false,
  };
}

const add = (text: string): DiffLine => line("add", text);

describe("parseSuiteLine", () => {
  it("AC-1: reads the fixed shape", () => {
    expect(parseSuiteLine("full suite: 760 passed, 1 skipped, 0 failed")).toEqual({
      passed: 760,
      skipped: 1,
      failed: 0,
    });
  });

  it("AC-2: free text is null", () => {
    expect(parseSuiteLine("dotnet test 329/329")).toBeNull();
  });

  it("AC-3: anything after the last number is null", () => {
    expect(parseSuiteLine("full suite: 760 passed, 1 skipped, 0 failed (12m)")).toBeNull();
  });
});

describe("addedTestCases", () => {
  it("AC-4: an added [Fact] names the next added method, underscores as spaces", () => {
    const files = [file([add("[Fact]"), add("    public async Task A_platform_token_is_accepted()")])];
    expect(addedTestCases(files)).toEqual([{ path: PATH, name: "A platform token is accepted" }]);
  });

  it("AC-5: [Theory] skips further attribute lines to reach the method", () => {
    const files = [file([add("[Theory]"), add("[InlineData(1)]"), add("public void Rounds_down(int x)")])];
    expect(addedTestCases(files).map((t) => t.name)).toEqual(["Rounds down"]);
  });

  it("AC-6: it( and test( with any quote, in line order", () => {
    const files = [
      file([add('it("does x", () => {})'), add("test('does y', async () => {})")], "src/a.test.ts"),
    ];
    expect(addedTestCases(files).map((t) => t.name)).toEqual(["does x", "does y"]);
  });

  it("AC-7: a context [Fact] is an existing test, not an added one", () => {
    const files = [file([line("ctx", "[Fact]"), add("public void A_b()")])];
    expect(addedTestCases(files)).toEqual([]);
  });

  it("AC-8: a removed test( is not counted", () => {
    const files = [file([line("del", "test('gone', () => {})")], "src/a.test.ts")];
    expect(addedTestCases(files)).toEqual([]);
  });

  it("AC-9: hunks null or absent contribute nothing and do not throw", () => {
    const nullHunks: CommitFileStat = { path: "a.bin", hunks: null, insertions: null, deletions: null, binary: true };
    const noHunks: CommitFileStat = { path: "b.ts", insertions: 1, deletions: 0, binary: false };
    expect(addedTestCases([nullHunks, noHunks])).toEqual([]);
  });

  it("does not read regex.test( or it.only( as a test", () => {
    const files = [file([add('if (re.test("x")) {}'), add('it.only("focused", () => {})')], "src/a.ts")];
    expect(addedTestCases(files)).toEqual([]);
  });

  it("[Fact(Skip = ...)] still marks a test", () => {
    const files = [file([add('[Fact(Skip = "flaky")]'), add("public void Skipped_one()")])];
    expect(addedTestCases(files).map((t) => t.name)).toEqual(["Skipped one"]);
  });

  it("keeps file order across files", () => {
    const files = [
      file([add("it('first', () => {})")], "src/b.test.ts"),
      file([add("[Fact]"), add("public void Second()")]),
    ];
    expect(addedTestCases(files)).toEqual([
      { path: "src/b.test.ts", name: "first" },
      { path: PATH, name: "Second" },
    ]);
  });
});
