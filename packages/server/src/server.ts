import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { handleQueueGet, handleQueueList } from "./routes/queue.js";
import { handleTaskGet, handleTasksList } from "./routes/tasks.js";

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

app.get("/", (c) => c.redirect("/static/index.html#/queue", 302));

app.get("/api/health", (c) => c.json({ ok: true }));

app.get("/api/queue", (c) => handleQueueList(c, artifactsDir));

app.get("/api/queue/:id", (c) => handleQueueGet(c, artifactsDir));

app.get("/api/tasks", (c) => handleTasksList(c, dbPath));

app.get("/api/tasks/:id", (c) => handleTaskGet(c, dbPath));

// --- Start ---

serve({ fetch: app.fetch, port, hostname: bind }, (info) => {
  console.log(`Companion server listening on http://${info.address}:${info.port}`);
});

export { app };
