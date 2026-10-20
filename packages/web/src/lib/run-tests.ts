// TASK-2562 — what the Runs screen says about an item's tests.
//
// Two readers, both pure:
//
//   parseSuiteLine   the suite total, from the one fixed shape the loops write
//                    as `testResults.passed[0]` (TASK-2561). Any other wording is
//                    shown verbatim by the view; guessing a number out of free
//                    text ("dotnet test 329/329", "vitest 860/860") would be
//                    right often enough to be trusted and wrong the rest.
//   addedTestCases   the tests a commit added, read from the ADDED lines of its
//                    diff. A context `[Fact]` is a test that already existed,
//                    and a removed `test(` is one that is gone, so neither counts.
//
// Declarations covered are the ones the registered repos use: xUnit `[Fact]` /
// `[Theory]` (C#) and `it(` / `test(` (TS/JS). `it.only(`, `it.each(` and
// `test.each(` are out of scope for v1.

import type { CommitFileStat } from "../api";

export interface SuiteTotal {
  passed: number;
  skipped: number;
  failed: number;
}

export interface AddedTestCase {
  path: string;
  name: string;
}

const SUITE_LINE = /^full suite: (\d+) passed, (\d+) skipped, (\d+) failed$/;

export function parseSuiteLine(line: string): SuiteTotal | null {
  const m = SUITE_LINE.exec(line);
  if (!m) return null;
  return { passed: Number(m[1]), skipped: Number(m[2]), failed: Number(m[3]) };
}

/** `[Fact]`, `[Theory]`, `[Fact(Skip = "x")]` — the attribute that marks an xUnit test. */
const XUNIT_TEST = /^\[(?:Fact|Theory)(?:\(.*\))?\]$/;
/** Any other attribute line between the marker and the method (`[InlineData(1)]`). */
const ATTRIBUTE = /^\[.*\]$/;
/** The method name: the identifier right before the parameter list. */
const METHOD = /([A-Za-z_]\w*)\s*\(/;
/**
 * `it("…"` / `test('…'` / `` it(`…` `` — not preceded by `.` or a word
 * character, so `regex.test("x")` and `it.only(` are not read as tests.
 */
const TS_TEST = /(?<![.\w])(?:it|test)\(\s*(["'`])((?:\\.|(?!\1).)*)\1/;

export function addedTestCases(files: CommitFileStat[]): AddedTestCase[] {
  const out: AddedTestCase[] = [];
  for (const file of files) {
    for (const hunk of file.hunks ?? []) {
      // Set by an added xUnit marker; the next added method line names the test.
      let pending = false;
      for (const line of hunk.lines) {
        if (line.kind !== "add") {
          pending = false;
          continue;
        }
        const text = line.text.trim();
        if (XUNIT_TEST.test(text)) {
          pending = true;
          continue;
        }
        if (pending) {
          if (text === "" || ATTRIBUTE.test(text)) continue;
          const name = METHOD.exec(text)?.[1];
          if (name) out.push({ path: file.path, name: name.replace(/_/g, " ") });
          pending = false;
          continue;
        }
        const name = TS_TEST.exec(text)?.[2];
        if (name !== undefined) out.push({ path: file.path, name });
      }
    }
  }
  return out;
}
