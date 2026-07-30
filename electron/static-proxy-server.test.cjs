const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { createStaticProxyServer, resolveStaticFile, contentTypeFor } = require("./static-proxy-server.cjs");

describe("resolveStaticFile", () => {
  const staticDir = fs.mkdtempSync(path.join(os.tmpdir(), "cdc-static-"));
  fs.writeFileSync(path.join(staticDir, "index.html"), "<html>root</html>");
  fs.writeFileSync(path.join(staticDir, "app.js"), "console.log(1)");

  it("serves an existing file as-is", () => {
    expect(resolveStaticFile(staticDir, "/app.js")).toBe(path.join(staticDir, "app.js"));
  });

  it("falls back to index.html for an unknown path (SPA routing)", () => {
    expect(resolveStaticFile(staticDir, "/knowledge/foo")).toBe(path.join(staticDir, "index.html"));
  });

  it("falls back to index.html for the root path", () => {
    expect(resolveStaticFile(staticDir, "/")).toBe(path.join(staticDir, "index.html"));
  });

  it("guards against path traversal", () => {
    expect(resolveStaticFile(staticDir, "/../../etc/passwd")).toBe(path.join(staticDir, "index.html"));
  });
});

describe("contentTypeFor", () => {
  it("maps known extensions", () => {
    expect(contentTypeFor("x.js")).toBe("text/javascript; charset=utf-8");
    expect(contentTypeFor("x.css")).toBe("text/css; charset=utf-8");
  });

  it("falls back to octet-stream for unknown extensions", () => {
    expect(contentTypeFor("x.bin")).toBe("application/octet-stream");
  });
});

describe("createStaticProxyServer (integration)", () => {
  const staticDir = fs.mkdtempSync(path.join(os.tmpdir(), "cdc-static-int-"));
  fs.writeFileSync(path.join(staticDir, "index.html"), "<html>hi</html>");
  let apiServer;
  let apiPort;
  let uiServer;
  let uiPort;

  beforeAll(async () => {
    apiServer = http.createServer((req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ path: req.url }));
    });
    await new Promise((resolve) => apiServer.listen(0, "127.0.0.1", resolve));
    apiPort = apiServer.address().port;

    uiServer = createStaticProxyServer({ staticDir, apiPort });
    await new Promise((resolve) => uiServer.listen(0, "127.0.0.1", resolve));
    uiPort = uiServer.address().port;
  });

  afterAll(() => {
    uiServer.close();
    apiServer.close();
  });

  it("serves the static index.html for a page request", async () => {
    const res = await fetch(`http://127.0.0.1:${uiPort}/`);
    expect(await res.text()).toContain("hi");
  });

  it("proxies /api/* to the adapter, stripping the prefix", async () => {
    const res = await fetch(`http://127.0.0.1:${uiPort}/api/sync/health`);
    expect(await res.json()).toEqual({ path: "/sync/health" });
  });

  it("returns 502 (not a hang or crash) when the adapter is unreachable", async () => {
    const deadUiServer = createStaticProxyServer({ staticDir, apiPort: 1 });
    await new Promise((resolve) => deadUiServer.listen(0, "127.0.0.1", resolve));
    const deadPort = deadUiServer.address().port;
    const res = await fetch(`http://127.0.0.1:${deadPort}/api/anything`);
    expect(res.status).toBe(502);
    deadUiServer.close();
  });
});

// TASK-1503 — the proxy injects x-choda-bridge-token so token-gated adapter
// routes (POST /capture) are reachable from the tokenless web shell.
describe("createStaticProxyServer bridge-token injection (integration)", () => {
  const staticDir = fs.mkdtempSync(path.join(os.tmpdir(), "cdc-static-tok-"));
  fs.writeFileSync(path.join(staticDir, "index.html"), "<html>hi</html>");
  let apiServer;
  let apiPort;
  let lastSeenToken;

  beforeAll(async () => {
    // Upstream echoes the token header it received (or null) so the test can
    // assert what the proxy forwarded.
    apiServer = http.createServer((req, res) => {
      lastSeenToken = req.headers["x-choda-bridge-token"] ?? null;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ token: lastSeenToken }));
    });
    await new Promise((resolve) => apiServer.listen(0, "127.0.0.1", resolve));
    apiPort = apiServer.address().port;
  });

  afterAll(() => apiServer.close());

  async function withProxy(opts, fn) {
    const ui = createStaticProxyServer({ staticDir, apiPort, ...opts });
    await new Promise((resolve) => ui.listen(0, "127.0.0.1", resolve));
    try {
      await fn(ui.address().port);
    } finally {
      ui.close();
    }
  }

  it("injects the token on a proxied /api request when configured", async () => {
    await withProxy({ bridgeToken: "tok-abc" }, async (uiPort) => {
      const res = await fetch(`http://127.0.0.1:${uiPort}/api/capture`, { method: "POST" });
      expect((await res.json()).token).toBe("tok-abc");
    });
  });

  it("does not overwrite a token the request already carries", async () => {
    await withProxy({ bridgeToken: "tok-proxy" }, async (uiPort) => {
      const res = await fetch(`http://127.0.0.1:${uiPort}/api/capture`, {
        method: "POST",
        headers: { "x-choda-bridge-token": "tok-caller" },
      });
      expect((await res.json()).token).toBe("tok-caller");
    });
  });

  it("forwards without a token when none is configured (route then 401s upstream, unchanged)", async () => {
    await withProxy({}, async (uiPort) => {
      const res = await fetch(`http://127.0.0.1:${uiPort}/api/capture`, { method: "POST" });
      expect((await res.json()).token).toBeNull();
    });
  });

  it("never adds the token to a static-file response", async () => {
    await withProxy({ bridgeToken: "tok-abc" }, async (uiPort) => {
      const res = await fetch(`http://127.0.0.1:${uiPort}/`);
      expect(res.headers.get("x-choda-bridge-token")).toBeNull();
      expect(await res.text()).toContain("hi");
    });
  });
});
