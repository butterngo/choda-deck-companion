import { appendFile } from "node:fs/promises";

export interface AuditEntry {
  action: string;
  [key: string]: unknown;
}

export async function appendAuditLog(
  logPath: string,
  entry: AuditEntry,
): Promise<void> {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n";
  await appendFile(logPath, line, "utf8");
}
