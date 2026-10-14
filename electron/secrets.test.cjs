// Quick-copy secrets: names out to the renderer, values only to the clipboard.

const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { createSecretsHandlers, parseEntries } = require("./secrets.cjs");

describe("parseEntries", () => {
  it("returns one entry per filled KEY=VALUE line and skips comments", () => {
    const text = "# note=x\nendpoint=https://a\nkey=\n\n  API_KEY = abc \n";
    expect(parseEntries(text)).toEqual([
      { key: "endpoint", value: "https://a" },
      { key: "API_KEY", value: "abc" },
    ]);
  });

  it("treats a bare value as one entry with an empty key", () => {
    expect(parseEntries("s3cr3t\r\n")).toEqual([{ key: "", value: "s3cr3t" }]);
  });

  it("returns nothing for an unfilled template", () => {
    expect(parseEntries("# fill in\nkey=\nendpoint=\n")).toEqual([]);
  });
});

describe("secrets handlers", () => {
  let root;
  let clip;
  let timers;

  function makeWs(name, files) {
    const cwd = path.join(root, name);
    fs.mkdirSync(path.join(cwd, "sensitive_information"), { recursive: true });
    for (const [f, text] of Object.entries(files)) {
      fs.writeFileSync(path.join(cwd, "sensitive_information", f), text);
    }
    return cwd;
  }

  function handlers(workspaces) {
    clip = "";
    timers = [];
    return createSecretsHandlers({
      listWorkspaces: async () => workspaces,
      clipboard: { writeText: (t) => (clip = t), readText: () => clip },
      setTimer: (fn) => timers.push(fn),
    });
  }

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "secrets-"));
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it("lists names only, never values, and skips templates and shared cwds", async () => {
    const cwd = makeWs("deck", {
      "token.txt": "tok-value",
      "azure.txt": "key=k-value\nendpoint=e-value",
      "azure.template.txt": "key=example",
    });
    const h = handlers([
      { id: "deck", label: "Deck", cwd },
      { id: "deck-2", label: "Same cwd", cwd },
      { id: "gone", label: "Archived", cwd, archivedAt: "2026-01-01" },
    ]);
    const res = await h.list();
    expect(res.ok).toBe(true);
    expect(res.entries).toEqual([
      { workspaceId: "deck", workspaceLabel: "Deck", file: "azure.txt", key: "key" },
      { workspaceId: "deck", workspaceLabel: "Deck", file: "azure.txt", key: "endpoint" },
      { workspaceId: "deck", workspaceLabel: "Deck", file: "token.txt", key: "" },
    ]);
    expect(JSON.stringify(res)).not.toMatch(/value/);
  });

  it("copies the value to the clipboard and clears it later if unchanged", async () => {
    const cwd = makeWs("deck", { "azure.txt": "key=k-value" });
    const h = handlers([{ id: "deck", cwd }]);
    const res = await h.copy("deck", "azure.txt", "key");
    expect(res).toEqual({ ok: true, clearsInSeconds: 45 });
    expect(clip).toBe("k-value");
    timers[0]();
    expect(clip).toBe("");
  });

  it("does not clear the clipboard when something else was copied meanwhile", async () => {
    const cwd = makeWs("deck", { "t.txt": "v" });
    const h = handlers([{ id: "deck", cwd }]);
    await h.copy("deck", "t.txt", "");
    clip = "other";
    timers[0]();
    expect(clip).toBe("other");
  });

  it("refuses paths that leave the folder", async () => {
    const cwd = makeWs("deck", {});
    fs.writeFileSync(path.join(cwd, "outside.txt"), "x");
    const h = handlers([{ id: "deck", cwd }]);
    for (const bad of ["../outside.txt", "..", "sub/x.txt", "C:\\x.txt", ""]) {
      expect((await h.copy("deck", bad, "")).ok).toBe(false);
    }
    expect(clip).toBe("");
  });

  it("reveals one value by name and applies the same path checks", async () => {
    const cwd = makeWs("deck", { "azure.txt": "key=k-value" });
    fs.writeFileSync(path.join(cwd, "outside.txt"), "x");
    const h = handlers([{ id: "deck", cwd }]);
    expect(await h.reveal("deck", "azure.txt", "key")).toEqual({ ok: true, value: "k-value" });
    expect((await h.reveal("deck", "../outside.txt", "")).ok).toBe(false);
    expect(clip).toBe("");
  });

  it("refuses an unknown workspace or key", async () => {
    const cwd = makeWs("deck", { "t.txt": "a=1" });
    const h = handlers([{ id: "deck", cwd }]);
    expect(await h.copy("nope", "t.txt", "a")).toEqual({ ok: false, reason: "unknown workspace" });
    expect(await h.copy("deck", "t.txt", "b")).toEqual({ ok: false, reason: "key not found" });
  });
});
