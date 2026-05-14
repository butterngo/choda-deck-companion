import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { generateBase58Topic, loadOrCreateTopic } from "../topic.js";

describe("generateBase58Topic", () => {
  it("produces a 24-char base58 string by default", () => {
    const t = generateBase58Topic();
    expect(t).toHaveLength(24);
    expect(t).toMatch(/^[1-9A-HJ-NP-Za-km-z]{24}$/);
  });

  it("two consecutive topics differ", () => {
    expect(generateBase58Topic()).not.toBe(generateBase58Topic());
  });
});

describe("loadOrCreateTopic", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "topic-"));
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("uses NTFY_TOPIC when provided and does not touch the store file", async () => {
    const storePath = path.join(tmp, "notifier.json");
    const r = await loadOrCreateTopic("CUSTOM_TOPIC", storePath);
    expect(r).toEqual({ topic: "CUSTOM_TOPIC", created: false });
    await expect(fs.access(storePath)).rejects.toBeTruthy();
  });

  it("creates and persists a new topic on first run", async () => {
    const storePath = path.join(tmp, "nested", "notifier.json");
    const r1 = await loadOrCreateTopic(undefined, storePath);
    expect(r1.created).toBe(true);
    expect(r1.topic).toMatch(/^[1-9A-HJ-NP-Za-km-z]{24}$/);

    const r2 = await loadOrCreateTopic(undefined, storePath);
    expect(r2).toEqual({ topic: r1.topic, created: false });

    const persisted = JSON.parse(await fs.readFile(storePath, "utf8")) as { topic: string };
    expect(persisted.topic).toBe(r1.topic);
  });

  it("falls back to generating a new topic if the store file is corrupt", async () => {
    const storePath = path.join(tmp, "notifier.json");
    await fs.writeFile(storePath, "{not json", "utf8");
    const r = await loadOrCreateTopic(undefined, storePath);
    expect(r.created).toBe(true);
    expect(r.topic).toMatch(/^[1-9A-HJ-NP-Za-km-z]{24}$/);
  });
});
