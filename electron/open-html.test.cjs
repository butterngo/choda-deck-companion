// TASK-2145 — the guard on the second hand-off to the operating system.
//
// Same discipline as open-folder.test.cjs: every refusal asserts TWO things —
// the result is not ok, AND shell.openExternal was never called. A handler that
// opened the file and then reported failure would pass a result-only check while
// doing all of the damage.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { createOpenHtmlHandler, workspaceCwdResolver } = require("./open-html.cjs");

let root;
let outside;
let opened;
let shell;
let open;

function recordingShell() {
  opened = [];
  return {
    openExternal: async (url) => {
      opened.push(url);
    },
  };
}

beforeEach(() => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "choda-open-html-"));
  root = path.join(tmp, "ws");
  outside = path.join(tmp, "elsewhere");
  fs.mkdirSync(path.join(root, "docs", "r"), { recursive: true });
  fs.mkdirSync(path.join(root, "docs", "dir.html"), { recursive: true });
  fs.mkdirSync(outside, { recursive: true });
  fs.writeFileSync(path.join(root, "docs", "r", "report.html"), "<h1>r</h1>");
  fs.writeFileSync(path.join(root, "docs", "legacy.HTM"), "<h1>l</h1>");
  fs.writeFileSync(path.join(root, "docs", "payload.exe"), "MZ");
  fs.writeFileSync(path.join(root, "docs", "payload.bat"), "@echo off\r\n");
  fs.writeFileSync(path.join(root, "docs", "trick.html.exe"), "MZ");
  fs.writeFileSync(path.join(root, "docs", "guide.md"), "# g");
  fs.writeFileSync(path.join(outside, "secret.html"), "<h1>SECRET</h1>");
  shell = recordingShell();
  open = createOpenHtmlHandler({
    shell,
    resolveWorkspaceCwd: async (id) => (id === "ws" ? root : null),
  });
});

describe("opening a workspace .html in the browser", () => {
  it("AC-1 — opens the file under the workspace root as a file:// URL", async () => {
    expect(await open("ws", "docs/r/report.html")).toEqual({ ok: true });
    expect(opened).toEqual([pathToFileURL(path.join(root, "docs", "r", "report.html")).href]);
  });

  it("AC-1 — .htm counts, in any case", async () => {
    expect((await open("ws", "docs/legacy.HTM")).ok).toBe(true);
    expect(opened).toHaveLength(1);
  });
});

describe("AC-2 — refusals never reach the shell", () => {
  const cases = [
    ["an .exe", "ws", "docs/payload.exe"],
    ["a .bat", "ws", "docs/payload.bat"],
    ["a double extension ending in .exe", "ws", "docs/trick.html.exe"],
    ["a markdown file", "ws", "docs/guide.md"],
    ["a .html path that resolves to a .bat", "ws", "docs/r/report.html/../../payload.bat"],
    ["a .. escape to a real .html outside", "ws", "../elsewhere/secret.html"],
    ["an absolute path", "ws", "/etc/x.html"],
    ["a drive-lettered path", "ws", "C:/x.html"],
    ["a directory named like a file", "ws", "docs/dir.html"],
    ["a missing file", "ws", "docs/nope.html"],
    ["an unknown workspace", "other", "docs/r/report.html"],
    ["the workspace root itself", "ws", "."],
  ];

  for (const [label, ws, rel] of cases) {
    it(`refuses ${label}`, async () => {
      const r = await open(ws, rel);
      expect(r.ok).toBe(false);
      expect(typeof r.reason).toBe("string");
      expect(opened).toEqual([]);
    });
  }

  it("refuses non-string arguments", async () => {
    for (const [ws, rel] of [[undefined, "a.html"], ["ws", undefined], [1, "a.html"], ["ws", {}], ["", "a.html"], ["ws", "  "]]) {
      expect((await open(ws, rel)).ok).toBe(false);
    }
    expect(opened).toEqual([]);
  });

  it("refuses when the workspace lookup throws", async () => {
    const failing = createOpenHtmlHandler({
      shell,
      resolveWorkspaceCwd: async () => {
        throw new Error("adapter down");
      },
    });
    expect(await failing("ws", "docs/r/report.html")).toEqual({ ok: false, reason: "unknown workspace" });
    expect(opened).toEqual([]);
  });
});

describe("workspaceCwdResolver", () => {
  it("asks the adapter with the bridge token and returns the matching cwd", async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url, token: init.headers["x-choda-bridge-token"] });
      return { ok: true, json: async () => ({ workspaces: [{ id: "a", cwd: "C:\\a" }, { id: "ws", cwd: "C:\\ws" }] }) };
    };
    const resolve = workspaceCwdResolver({ apiPort: 4321, bridgeToken: "tok", fetchImpl });
    expect(await resolve("ws")).toBe("C:\\ws");
    expect(await resolve("missing")).toBeNull();
    expect(calls[0]).toEqual({ url: "http://127.0.0.1:4321/workspaces", token: "tok" });
  });

  it("returns null when the adapter refuses", async () => {
    const resolve = workspaceCwdResolver({
      apiPort: 1,
      bridgeToken: "tok",
      fetchImpl: async () => ({ ok: false, json: async () => ({}) }),
    });
    expect(await resolve("ws")).toBeNull();
  });
});
