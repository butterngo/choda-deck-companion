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

  it("lists files per workspace without opening them, skipping templates, large and binary files, and shared cwds", async () => {
    const cwd = makeWs("deck", {
      "token.txt": "tok-value",
      "azure.txt": "key=k-value\nendpoint=e-value",
      "azure.template.txt": "key=example",
      "export.json": "x".repeat(64 * 1024 + 1),
      "quote.xlsx": "PK",
    });
    makeWs("empty", {});
    const reads = [];
    const h = createSecretsHandlers({
      listWorkspaces: async () => [
        { id: "deck", label: "Deck", cwd },
        { id: "deck-2", label: "Same cwd", cwd },
        { id: "gone", label: "Archived", cwd, archivedAt: "2026-01-01" },
        { id: "empty", cwd: path.join(root, "empty") },
      ],
      clipboard: { writeText: () => {}, readText: () => "" },
      readFileSync: (...args) => {
        reads.push(args[0]);
        return fs.readFileSync(...args);
      },
    });
    const res = await h.listFiles();
    expect(res).toEqual({
      ok: true,
      workspaces: [{ workspaceId: "deck", workspaceLabel: "Deck", files: ["azure.txt", "token.txt"] }],
    });
    expect(reads).toEqual([]);
  });

  it("lists one workspace's entry names, never values", async () => {
    const cwd = makeWs("deck", {
      "token.txt": "tok-value",
      "azure.txt": "key=k-value\nendpoint=e-value",
    });
    const other = makeWs("other", { "x.txt": "other-value" });
    const h = handlers([
      { id: "deck", label: "Deck", cwd },
      { id: "other", cwd: other },
    ]);
    const res = await h.listEntries("deck");
    expect(res).toEqual({
      ok: true,
      entries: [
        { workspaceId: "deck", workspaceLabel: "Deck", file: "azure.txt", key: "key" },
        { workspaceId: "deck", workspaceLabel: "Deck", file: "azure.txt", key: "endpoint" },
        { workspaceId: "deck", workspaceLabel: "Deck", file: "token.txt", key: "" },
      ],
    });
    expect(JSON.stringify(res)).not.toMatch(/value/);
    expect(await h.listEntries("nope")).toEqual({ ok: false, reason: "unknown workspace" });
  });

  it("refuses to copy or reveal a file over the size limit", async () => {
    const cwd = makeWs("deck", { "big.txt": "x".repeat(64 * 1024 + 1) });
    const h = handlers([{ id: "deck", cwd }]);
    expect(await h.copy("deck", "big.txt", "")).toEqual({ ok: false, reason: "file too large" });
    expect(await h.reveal("deck", "big.txt", "")).toEqual({ ok: false, reason: "file too large" });
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
