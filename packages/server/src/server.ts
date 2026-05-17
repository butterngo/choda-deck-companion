import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { Hono } from "hono";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { handleConversationGet, handleConversationList } from "./routes/conversations.js";
import { handleQueueGet, handleQueueList, handleQueueLive } from "./routes/queue.js";
import { handleInboxGet, handleInboxList } from "./routes/inbox.js";
import { handleProjectList, handleWorkspaceList } from "./routes/projects.js";
import { handleQueueStart } from "./routes/queue-start.js";
import { handleTaskGet, handleTasksList } from "./routes/tasks.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- CLI flag parsing ---

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg?.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        args[key] = next;
        i++;
      } else {
        args[key] = "true";
      }
    }
  }
  return args;
}

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function genToken(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => BASE58[b % BASE58.length]!)
    .join("")
    .slice(0, length);
}

const rawArgs = parseArgs(process.argv.slice(2));

const port = parseInt(rawArgs["port"] ?? "8080", 10);
const bind = rawArgs["bind"] ?? "127.0.0.1";
const artifactsDir =
  rawArgs["artifacts-dir"] ??
  process.env["CHODA_ARTIFACTS_DIR"] ??
  "C:\\dev\\choda-deck\\data\\artifacts";
const dbPath =
  rawArgs["db-path"] ??
  process.env["CHODA_DB_PATH"] ??
  "C:\\dev\\choda-deck\\data\\database\\choda-deck.db";
const cliPath =
  rawArgs["cli-path"] ??
  process.env["CHODA_CLI_PATH"] ??
  "C:\\dev\\choda-deck\\dist\\cli.cjs";
const dataDir =
  rawArgs["data-dir"] ??
  process.env["CHODA_DATA_DIR"] ??
  "C:\\dev\\choda-deck\\data";
const auditLogPath =
  rawArgs["audit-log"] ??
  process.env["CHODA_AUDIT_LOG"] ??
  join(dataDir, "audit.log");

// React SPA dist (built by Vite in packages/web). Override with CHODA_WEB_DIST.
// Default: resolve relative to this file. src/server.ts → packages/web/dist
// is reached via ../../web/dist; dist/server.js (built) lands at the same place.
const rawWebDist =
  rawArgs["web-dist"] ?? process.env["CHODA_WEB_DIST"] ?? "";
const webDist = rawWebDist
  ? isAbsolute(rawWebDist) ? rawWebDist : resolve(process.cwd(), rawWebDist)
  : resolve(__dirname, "..", "..", "web", "dist");

const lanMode = bind === "0.0.0.0";

let token = rawArgs["token"] ?? "";
if (lanMode && !token) {
  token = genToken(32);
  console.log(`Token: ${token}`);
}

// --- Hono app ---

const app = new Hono();

// Token middleware — only active in LAN mode (--bind 0.0.0.0)
if (lanMode) {
  app.use("/api/*", async (c, next) => {
    const auth = c.req.header("Authorization") ?? "";
    const provided = auth.startsWith("Bearer ") ? auth.slice(7) : c.req.query("token") ?? "";
    if (provided !== token) {
      return c.text("Invalid token. Check CLI output.", 401);
    }
    await next();
  });
}

app.get("/api/health", (c) => c.json({ ok: true }));

app.get("/api/queue", (c) => handleQueueList(c, artifactsDir));

app.get("/api/queue/live", (c) => handleQueueLive(c, artifactsDir));

app.get("/api/queue/:id", (c) => handleQueueGet(c, artifactsDir));

app.get("/api/tasks", (c) => handleTasksList(c, dbPath));

app.get("/api/tasks/:id", (c) => handleTaskGet(c, dbPath));

app.get("/api/inbox", (c) => handleInboxList(c, dbPath));

app.get("/api/inbox/:id", (c) => handleInboxGet(c, dbPath));

app.get("/api/conversations", (c) => handleConversationList(c, dbPath));

app.get("/api/conversations/:id", (c) => handleConversationGet(c, dbPath));

app.get("/api/projects", (c) => handleProjectList(c, dbPath));

app.get("/api/workspaces", (c) => handleWorkspaceList(c, dbPath));

app.post("/api/queue/start", (c) =>
  handleQueueStart(c, {
    dbPath,
    cliPath,
    dataDir,
    auditLogPath,
    spawnFn: spawn,
  }),
);

// --- SPA serve: web/dist for assets + SPA fallback for unknown non-/api paths ---

const webDistExists = existsSync(webDist);
if (!webDistExists) {
  console.warn(
    `[warn] web dist not found at ${webDist}. Build with: pnpm --filter web build. ` +
      `Set CHODA_WEB_DIST to override.`,
  );
}

app.use(
  "/assets/*",
  serveStatic({
    root: webDist,
    rewriteRequestPath: (path) => path,
  }),
);

const SPA_HTML_CACHE: { html: string | null } = { html: null };
async function loadIndex(): Promise<string> {
  if (SPA_HTML_CACHE.html) return SPA_HTML_CACHE.html;
  const html = await readFile(join(webDist, "index.html"), "utf8");
  SPA_HTML_CACHE.html = html;
  return html;
}

app.get("*", async (c) => {
  if (c.req.path.startsWith("/api/")) return c.notFound();
  try {
    const html = await loadIndex();
    return c.html(html);
  } catch {
    return c.text(
      `Web client not built. Run \`pnpm --filter web build\` first (looked in ${webDist}).`,
      503,
    );
  }
});

// --- Start ---

serve({ fetch: app.fetch, port, hostname: bind }, (info) => {
  console.log(`Companion server listening on http://${info.address}:${info.port}`);
});

export { app };
