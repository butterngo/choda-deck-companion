/// <reference types="vitest" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// TASK-1159 — the companion talks to exactly ONE API: the laptop REST adapter
// (TASK-1158), default 127.0.0.1:7338. In dev we proxy `/api` to it so the
// browser stays same-origin (the adapter sets no CORS headers, by design — it's
// localhost-only). The remote pod (mcp.choda.dev) is NEVER referenced here; the
// laptop's own sync engine owns laptop↔remote.
const LAPTOP_API = process.env.CHODA_COMPANION_API ?? "http://127.0.0.1:7338";

export default defineConfig({
  base: "/",
  plugins: [react()],
  build: {
    outDir: "dist",
    sourcemap: true,
    target: "es2022",
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: LAPTOP_API,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/setup-tests.ts"],
  },
});
