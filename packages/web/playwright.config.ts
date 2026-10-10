import { defineConfig, devices } from "@playwright/test";

// TASK-2355 — browser e2e for the companion, kept out of `pnpm test` (vitest)
// so the unit suite stays fast. The adapter is never reached: every spec mocks
// /api/** with page.route, so a run needs no laptop API and no data dir.
// The JSON report is what `choda-deck improve measure` reads (TASK-2356).
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: "e2e-results/report.json" }]],
  use: {
    baseURL: "http://localhost:5173",
    trace: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm --filter web dev",
    url: "http://localhost:5173",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
