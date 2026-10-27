// TASK-2773 — native controls follow the app's theme. jsdom does not apply
// index.css, and the bug lives in Chromium's select popup, so this checks the
// stylesheet itself: removing any of the three rules brings back white option
// text on a white list in Dark theme.

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const css = fs.readFileSync(path.join(__dirname, "..", "index.css"), "utf8");

/** The declarations of every rule whose selector is exactly `selector`, joined. */
function declarations(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?:^|[}\\n])\\s*${escaped}\\s*\\{([^}]*)\\}`, "g");
  return [...css.matchAll(re)].map((m) => m[1]).join("\n");
}

describe("dark mode native controls", () => {
  it(".dark sets color-scheme: dark", () => {
    expect(declarations(".dark")).toMatch(/color-scheme:\s*dark\s*;/);
  });

  it(":root sets color-scheme: light", () => {
    expect(declarations(":root")).toMatch(/color-scheme:\s*light\s*;/);
  });

  it(".dark option sets a dark background and a light text colour", () => {
    const d = declarations(".dark option");
    expect(d).toMatch(/background-color:\s*rgb\(24 24 27\)\s*;/);
    expect(d).toMatch(/(?:^|[;\s])color:\s*rgb\(244 244 245\)\s*;/);
  });
});
