import path from "node:path";
import { startNotifier } from "./notifier.js";
import { loadOrCreateTopic } from "./topic.js";

const DEFAULT_ARTIFACTS_DIR = "C:\\dev\\choda-deck\\data\\artifacts";
const DEFAULT_NTFY_HOST = "https://ntfy.sh";

type Args = {
  artifactsDir?: string;
  ntfyHost?: string;
};

function parseArgs(argv: string[]): Args {
  const out: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if ((a === "--artifacts-dir" || a === "-a") && next) {
      out.artifactsDir = next;
      i++;
    } else if (a === "--ntfy-host" && next) {
      out.ntfyHost = next;
      i++;
    } else if (a === "--help" || a === "-h") {
      printHelp();
      process.exit(0);
    }
  }
  return out;
}

function printHelp(): void {
  process.stdout.write(`
Usage: pnpm --filter notifier start -- [options]

Options:
  --artifacts-dir, -a <path>   Watch <path>/queue-*/queue.jsonl.
                               Falls back to CHODA_ARTIFACTS_DIR env, then
                               ${DEFAULT_ARTIFACTS_DIR}
  --ntfy-host <url>            Default: ${DEFAULT_NTFY_HOST}
  -h, --help                   Show help.

Env:
  NTFY_TOPIC                   Use this topic. If unset, a 24-char base58 topic
                               is generated and persisted under
                               ~/.choda-deck-companion/notifier.json.
  CHODA_ARTIFACTS_DIR          Artifacts dir override.
`);
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  const artifactsDir = args.artifactsDir ?? process.env.CHODA_ARTIFACTS_DIR ?? DEFAULT_ARTIFACTS_DIR;
  const ntfyHost = args.ntfyHost ?? DEFAULT_NTFY_HOST;

  const { topic, created } = await loadOrCreateTopic(process.env.NTFY_TOPIC);
  const subscribeUrl = `${ntfyHost}/${topic}`;
  if (created) {
    process.stdout.write("\n");
    process.stdout.write("==============================================================\n");
    process.stdout.write("  Generated new ntfy topic — subscribe to receive alerts:\n");
    process.stdout.write(`  ${subscribeUrl}\n`);
    process.stdout.write("  (persisted under ~/.choda-deck-companion/notifier.json;\n");
    process.stdout.write("   will be reused on next run)\n");
    process.stdout.write("==============================================================\n\n");
  } else {
    process.stdout.write(`[notifier] using topic ${subscribeUrl}\n`);
  }

  const handle = await startNotifier({ artifactsDir, topic, ntfyHost });
  process.stdout.write(`[notifier] watching ${path.resolve(artifactsDir)}\n`);

  let stopping = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (stopping) return;
    stopping = true;
    process.stdout.write(`[notifier] received ${signal}, stopping...\n`);
    await handle.stop();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err: unknown) => {
  process.stderr.write(`[notifier] fatal: ${(err as Error).stack ?? String(err)}\n`);
  process.exit(1);
});
