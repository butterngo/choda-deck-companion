import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/dist-types/**",
      "**/node_modules/**",
      "**/out/**",
      "release/**",
      "electron/vendor/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
  // TASK-1438 — build-time node scripts (vendor-adapter.mjs etc.)
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  // TASK-1437 — electron/ is plain CommonJS (electron-builder/main-process
  // convention, mirrors english-companion's electron/*.cjs); require() is the
  // point, and its *.test.cjs files run under vitest's globals: true.
  // TASK-1964 — scripts/*.cjs joins it: a script Electron runs as a main
  // process is CommonJS for the same reason, and proof-loopback.cjs requires
  // electron/display-media.cjs directly so the proof drives the real handler.
  // It stays in scripts/ rather than electron/ because electron/** is packaged
  // into the installer and a proof script has no business shipping.
  {
    files: ["electron/**/*.cjs", "scripts/**/*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: {
        ...globals.node,
        describe: "readonly",
        it: "readonly",
        expect: "readonly",
        vi: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
);
