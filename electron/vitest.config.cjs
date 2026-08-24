// TASK-1437 — electron/ isn't a pnpm workspace package (electron-builder needs
// the root package.json to be the packaged app's own package.json), so it gets
// its own minimal vitest config rather than joining packages/*'s per-package
// setup.
const { defineConfig } = require("vitest/config");

module.exports = defineConfig({
  test: {
    // scripts/ joins this config rather than growing a third one: the release
    // guards (TASK-1763) are plain node scripts with no package of their own,
    // and an untested release guard is worth very little.
    include: ["electron/**/*.test.cjs", "scripts/**/*.test.mjs"],
    environment: "node",
    globals: true,
  },
});
