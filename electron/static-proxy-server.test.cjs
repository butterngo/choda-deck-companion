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

// TASK-1877 AC-3 — the piece this proxy has never done.
//
// The relay is byte-level: it does not parse WebSocket frames, it pipes the
// socket both ways after the handshake. So the test drives raw sockets rather
// than a ws client — that is the actual contract, and it keeps `ws` out of the
// companion's dependencies for a transport the companion does not implement.
describe("upgrade relay", () => {
  const net = require("node:net");
  const CRLF = String.fromCharCode(13, 10);

  const upgradeRequest = (path) =>
    [
      `GET ${path} HTTP/1.1`,
      "Host: 127.0.0.1",
      "Upgrade: websocket",
      "Connection: Upgrade",
      "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==",
      "Sec-WebSocket-Version: 13",
      "",
      "",
    ].join(CRLF);

  // A stub adapter that completes the handshake and then echoes bytes, so the
  // relay has something real on the far side.
  function stubAdapter(onUpgrade) {
    const srv = http.createServer((_req, res) => {
      res.writeHead(200);
      res.end("http");
    });
    srv.on("upgrade", (req, socket, head) => {
      onUpgrade(req);
      socket.write(
        ["HTTP/1.1 101 Switching Protocols", "Upgrade: websocket", "Connection: Upgrade", "", ""].join(CRLF),
      );
      if (head && head.length) socket.unshift(head);
      socket.on("data", (d) => socket.write(`up:${d}`));
    });
    return srv;
  }

  function listen(srv) {
    return new Promise((resolve) => srv.listen(0, "127.0.0.1", () => resolve(srv.address().port)));
  }

  it("forwards the upgrade WITH the bridge token and relays bytes both ways", async () => {
    let seenToken = "MISSING";
    const adapter = stubAdapter((req) => {
      seenToken = req.headers["x-choda-bridge-token"] ?? "MISSING";
    });
    const apiPort = await listen(adapter);
    const staticDir = fs.mkdtempSync(path.join(os.tmpdir(), "cdc-up-"));
    fs.writeFileSync(path.join(staticDir, "index.html"), "<html></html>");
    const proxy = createStaticProxyServer({ staticDir, apiPort, bridgeToken: "tok-123" });
    const proxyPort = await listen(proxy);

    const sock = net.connect(proxyPort, "127.0.0.1");
    const transcript = await new Promise((resolve) => {
      let buf = "";
      sock.on("data", (d) => {
        buf += String(d);
        if (buf.includes("101")) sock.write("ping");
        if (buf.includes("up:ping")) resolve(buf);
      });
      sock.on("connect", () => sock.write(upgradeRequest("/api/terminal")));
      setTimeout(() => resolve(buf), 3000);
    });
    sock.destroy();
    adapter.close();
    proxy.close();

    // The token reached the adapter — the page cannot set it, so if this is
    // MISSING the terminal is unreachable in the packaged app.
    expect(seenToken).toBe("tok-123");
    expect(transcript).toContain("101");
    // And bytes crossed AFTER the handshake, in both directions. A relay that
    // completes the handshake and then pipes nothing looks identical up to here.
    expect(transcript).toContain("up:ping");
  });

  it("passes a refusal through and destroys, rather than hanging", async () => {
    const adapter = http.createServer(() => {});
    adapter.on("upgrade", (_req, socket) => {
      socket.write(`HTTP/1.1 401 Unauthorized${CRLF}${CRLF}`);
      socket.destroy();
    });
    const apiPort = await listen(adapter);
    const staticDir = fs.mkdtempSync(path.join(os.tmpdir(), "cdc-up2-"));
    fs.writeFileSync(path.join(staticDir, "index.html"), "<html></html>");
    const proxy = createStaticProxyServer({ staticDir, apiPort, bridgeToken: "tok-123" });
    const proxyPort = await listen(proxy);

    const sock = net.connect(proxyPort, "127.0.0.1");
    const raw = await new Promise((resolve) => {
      let buf = "";
      sock.on("data", (d) => {
        buf += String(d);
      });
      sock.on("close", () => resolve(buf));
      sock.on("connect", () => sock.write(upgradeRequest("/api/terminal")));
      setTimeout(() => resolve(buf), 3000);
    });
    adapter.close();
    proxy.close();

    expect(raw).toContain("401");
    // A hang is the failure this catches: the close only fires because the
    // refusal was relayed and the socket torn down.
    expect(sock.destroyed).toBe(true);
  });

  it("refuses an upgrade on a non-/api path instead of leaving it open", async () => {
    const staticDir = fs.mkdtempSync(path.join(os.tmpdir(), "cdc-up3-"));
    fs.writeFileSync(path.join(staticDir, "index.html"), "<html></html>");
    const proxy = createStaticProxyServer({ staticDir, apiPort: 1, bridgeToken: "tok-123" });
    const proxyPort = await listen(proxy);

    const sock = net.connect(proxyPort, "127.0.0.1");
    const raw = await new Promise((resolve) => {
      let buf = "";
      sock.on("data", (d) => {
        buf += String(d);
      });
      sock.on("close", () => resolve(buf));
      sock.on("connect", () => sock.write(upgradeRequest("/terminal")));
      setTimeout(() => resolve(buf), 3000);
    });
    proxy.close();
    expect(raw).toContain("404");
    expect(sock.destroyed).toBe(true);
  });

  it("AC-5 — ordinary /api requests still proxy with the socket handler attached", async () => {
    const adapter = http.createServer((req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ path: req.url, token: req.headers["x-choda-bridge-token"] }));
    });
    const apiPort = await listen(adapter);
    const staticDir = fs.mkdtempSync(path.join(os.tmpdir(), "cdc-up4-"));
    fs.writeFileSync(path.join(staticDir, "index.html"), "<html></html>");
    const proxy = createStaticProxyServer({ staticDir, apiPort, bridgeToken: "tok-123" });
    const proxyPort = await listen(proxy);

    const res = await fetch(`http://127.0.0.1:${proxyPort}/api/workspaces`);
    const body = await res.json();
    adapter.close();
    proxy.close();

    // Adding an upgrade listener must not disturb the request path it shares.
    expect(res.status).toBe(200);
    expect(body).toEqual({ path: "/workspaces", token: "tok-123" });
  });
});
