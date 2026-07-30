/// <reference types="vitest" />
import { readFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// TASK-1159 — the companion talks to exactly ONE API: the laptop REST adapter
// (TASK-1158), default 127.0.0.1:7338. In dev we proxy `/api` to it so the
// browser stays same-origin (the adapter sets no CORS headers, by design — it's
// localhost-only). The remote pod (mcp.choda.dev) is NEVER referenced here; the
// laptop's own sync engine owns laptop↔remote.
const LAPTOP_API = process.env.CHODA_COMPANION_API ?? "http://127.0.0.1:7338";

// TASK-1503 — token-gated adapter routes (POST /capture) need x-choda-bridge-token,
// but the browser holds no credential (src/config.ts). Inject it in the dev proxy
// (mirrors the Electron static-proxy in prod) so /capture is testable in
// `pnpm --filter web dev`. Sourced from env: CHODA_BRIDGE_TOKEN, or read from the
// path in CHODA_BRIDGE_TOKEN_FILE. Absent → no header (gated routes 401 as today).
function resolveDevBridgeToken(): string | undefined {
  const inline = process.env.CHODA_BRIDGE_TOKEN;
  if (inline && inline.length > 0) return inline;
  const file = process.env.CHODA_BRIDGE_TOKEN_FILE;
  if (file && file.length > 0) {
    try {
      const token = readFileSync(file, "utf8").trim();
      return token.length > 0 ? token : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}
const DEV_BRIDGE_TOKEN = resolveDevBridgeToken();

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
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq) => {
            if (DEV_BRIDGE_TOKEN && !proxyReq.getHeader("x-choda-bridge-token")) {
              proxyReq.setHeader("x-choda-bridge-token", DEV_BRIDGE_TOKEN);
            }
          });
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/setup-tests.ts"],
  },
});
