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
