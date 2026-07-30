// TASK-1437 — the packaged web UI still calls a same-origin relative `/api`
// (packages/web/src/config.ts's API_BASE, unchanged — TASK-1159's own build
// check fails if that ever becomes absolute/remote). electron.loadFile() can't
// satisfy that: a file:// origin can't relative-fetch an http:// adapter port.
// This is the packaged-mode equivalent of Vite's dev proxy: serve the built
// dist as static files and reverse-proxy `/api/*` to the spawned adapter, so
// the renderer's own code needs no changes between dev and packaged builds.

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
};

function contentTypeFor(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

// SPA fallback: any non-/api, non-file-looking path serves index.html so
// react-router's hash routing (and a future non-hash route) still works.
function resolveStaticFile(staticDir, urlPath) {
  const clean = urlPath.split("?")[0].replace(/^\/+/, "");
  const candidate = path.join(staticDir, clean === "" ? "index.html" : clean);
  if (!candidate.startsWith(staticDir)) return path.join(staticDir, "index.html"); // path traversal guard
  return fs.existsSync(candidate) && fs.statSync(candidate).isFile() ? candidate : path.join(staticDir, "index.html");
}

// TASK-1503 — some adapter routes (POST /capture) are token-gated with
// x-choda-bridge-token, but the web shell deliberately holds no credential
// (packages/web/src/config.ts). Inject the token HERE, in the proxy the browser
// never sees, so those routes are reachable while the invariant holds. Only on
// /api proxying, never on static files; never overwrites a token the request
// already carries (an extension-origin request); absent token → forward as-is
// (the gated route then 401s, exactly as today).
function createStaticProxyServer({ staticDir, apiPort, apiHost = "127.0.0.1", bridgeToken }) {
  return http.createServer((req, res) => {
    if (req.url.startsWith("/api")) {
      const headers = { ...req.headers };
      if (bridgeToken && !headers["x-choda-bridge-token"]) {
        headers["x-choda-bridge-token"] = bridgeToken;
      }
      const target = http.request(
        { host: apiHost, port: apiPort, path: req.url.replace(/^\/api/, "") || "/", method: req.method, headers },
        (proxyRes) => {
          res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
          proxyRes.pipe(res);
        },
      );
      target.on("error", () => {
        res.writeHead(502, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "adapter unreachable" }));
      });
      req.pipe(target);
      return;
    }

    const filePath = resolveStaticFile(staticDir, req.url);
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, { "content-type": "text/plain" });
        res.end("not found");
        return;
      }
      res.writeHead(200, { "content-type": contentTypeFor(filePath) });
      res.end(data);
    });
  });
}

module.exports = { createStaticProxyServer, resolveStaticFile, contentTypeFor };
