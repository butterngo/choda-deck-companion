// TASK-1437 — electron/ isn't a pnpm workspace package (electron-builder needs
// the root package.json to be the packaged app's own package.json), so it gets
// its own minimal vitest config rather than joining packages/*'s per-package
// setup.
const { defineConfig } = require("vitest/config");

module.exports = defineConfig({
  test: {
    include: ["electron/**/*.test.cjs"],
    environment: "node",
    globals: true,
  },
});
