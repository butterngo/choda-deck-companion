import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const TOPIC_LEN = 24;

export const TOPIC_STORE_PATH = path.join(os.homedir(), ".choda-deck-companion", "notifier.json");

export function generateBase58Topic(len: number = TOPIC_LEN): string {
  // Reject bytes outside the largest multiple of 58 to keep the distribution flat.
  const cutoff = 256 - (256 % BASE58_ALPHABET.length);
  let out = "";
  while (out.length < len) {
    const buf = randomBytes(len * 2);
    for (let i = 0; i < buf.length && out.length < len; i++) {
      const b = buf[i]!;
      if (b < cutoff) out += BASE58_ALPHABET[b % BASE58_ALPHABET.length];
    }
  }
  return out;
}

export async function loadOrCreateTopic(
  envTopic: string | undefined,
  storePath: string = TOPIC_STORE_PATH,
): Promise<{ topic: string; created: boolean }> {
  if (envTopic && envTopic.trim().length > 0) {
    return { topic: envTopic.trim(), created: false };
  }
  try {
    const raw = await fs.readFile(storePath, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && typeof (parsed as { topic?: unknown }).topic === "string") {
      return { topic: (parsed as { topic: string }).topic, created: false };
    }
  } catch {
    // file missing or unreadable — fall through to create
  }
  const topic = generateBase58Topic();
  await fs.mkdir(path.dirname(storePath), { recursive: true });
  await fs.writeFile(storePath, JSON.stringify({ topic }, null, 2), "utf8");
  return { topic, created: true };
}
