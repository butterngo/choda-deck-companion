// TASK-1570 AC-2 — the route and the nav entry exist. Asserted against the
// router/Shell source rather than by mounting the whole app, matching how the
// shell's own structural invariants are checked elsewhere (single-api.test.ts).

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const SRC = join(__dirname, "..");

describe("conversations route wiring", () => {
  it("router registers /conversations → ConversationsView", () => {
    const router = readFileSync(join(SRC, "router.tsx"), "utf8");
    expect(router).toContain('path: "conversations"');
    expect(router).toContain("<ConversationsView />");
    expect(router).toContain('from "./views/ConversationsView"');
  });

  it("Shell exposes a Conversations tab", () => {
    const shell = readFileSync(join(SRC, "layouts", "Shell.tsx"), "utf8");
    expect(shell).toContain('to: "/conversations"');
    expect(shell).toContain('label: "Conversations"');
  });

  it("the catch-all redirect still comes last so it cannot shadow the new route", () => {
    const router = readFileSync(join(SRC, "router.tsx"), "utf8");
    expect(router.indexOf('path: "conversations"')).toBeLessThan(router.indexOf('path: "*"'));
  });
});
