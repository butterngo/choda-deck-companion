// TASK-1874 — create a container from an image.
//
// The form offers exactly what the route accepts: a name and port pairs. It
// does not offer volumes, and that absence is the point rather than an
// oversight — `-v C:\:/host` hands a container the whole drive, and that
// permission is deferred until it is asked for by someone who has used this.
//
// The confirmation names every port mapping, because the ports are the part
// with a consequence: they open a socket on the machine.

import { useState } from "react";
import { ContainerNameTakenError, DockerUnavailableError, runContainer } from "../api";
import type { DockerImage, RunPort } from "../api";

/** Docker's own rule, mirrored here so the reader is told before the round trip. */
const NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,62}$/;
const isPort = (n: number): boolean => Number.isInteger(n) && n >= 1 && n <= 65535;

export function DockerRunForm({
  image,
  onDone,
  onCancel,
}: {
  image: DockerImage;
  onDone: (msg: string) => void;
  onCancel: () => void;
}): React.JSX.Element {
  const [name, setName] = useState("");
  const [hostPort, setHostPort] = useState("");
  const [containerPort, setContainerPort] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const label = image.repository === "<none>" ? image.id.slice(0, 12) : `${image.repository}:${image.tag}`;

  const ports: RunPort[] =
    hostPort === "" && containerPort === ""
      ? []
      : [{ host: Number(hostPort), container: Number(containerPort) }];

  const nameOk = NAME_RE.test(name);
  const portsOk = ports.every((p) => isPort(p.host) && isPort(p.container));
  const ready = nameOk && portsOk;

  async function go(): Promise<void> {
    setConfirming(false);
    setBusy(true);
    setError(null);
    try {
      const out = await runContainer(image.id, name, ports);
      // The state comes from the daemon, read back by the adapter after the
      // command exited. An image whose command ends at once is already gone,
      // and saying "running" because the request succeeded would be a lie.
      onDone(`${out.name} is ${out.state}.`);
    } catch (err) {
      if (err instanceof ContainerNameTakenError) setError(`A container named ${name} already exists.`);
      else if (err instanceof DockerUnavailableError) setError("Docker is not running.");
      else setError(err instanceof Error ? err.message : "Could not create the container.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      data-testid="run-form"
      className="rounded-md border border-zinc-300 dark:border-zinc-700 p-3 text-[12.5px]"
    >
      <p className="mb-2">
        Run <span className="font-medium">{label}</span>
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="container name"
          aria-label="Container name"
          data-testid="run-name"
          className="w-48 rounded-md border border-zinc-200 dark:border-zinc-800 bg-transparent px-2 py-1 text-[12px]"
        />
        <input
          value={hostPort}
          onChange={(e) => setHostPort(e.target.value)}
          placeholder="host port"
          aria-label="Host port"
          data-testid="run-host-port"
          className="w-24 rounded-md border border-zinc-200 dark:border-zinc-800 bg-transparent px-2 py-1 text-[12px]"
        />
        <span className="text-zinc-400">:</span>
        <input
          value={containerPort}
          onChange={(e) => setContainerPort(e.target.value)}
          placeholder="in container"
          aria-label="Container port"
          data-testid="run-container-port"
          className="w-24 rounded-md border border-zinc-200 dark:border-zinc-800 bg-transparent px-2 py-1 text-[12px]"
        />
        <button
          type="button"
          onClick={onCancel}
          data-testid="run-cancel"
          className="ml-auto rounded-md border border-zinc-200 dark:border-zinc-800 px-2 py-1 text-[11.5px]"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!ready || busy}
          onClick={() => setConfirming(true)}
          data-testid="run-submit"
          className="rounded-md border border-amber-300 dark:border-amber-800 px-2 py-1 text-[11.5px] text-amber-700 dark:text-amber-300 disabled:opacity-40"
        >
          Run…
        </button>
      </div>

      {name !== "" && !nameOk && (
        // Said before the round trip, because the rule is docker's and the
        // reader has no way to know it otherwise.
        <p data-testid="run-name-invalid" className="mt-1.5 text-[11.5px] text-zinc-500">
          A name may hold letters, digits, dot, underscore and dash, must start with a letter or
          digit, and is at most 63 characters.
        </p>
      )}
      {!portsOk && (
        <p data-testid="run-port-invalid" className="mt-1.5 text-[11.5px] text-zinc-500">
          A port is a whole number between 1 and 65535, on both sides.
        </p>
      )}

      {confirming && (
        <div
          data-testid="run-confirm"
          className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-amber-300 dark:border-amber-800 px-2.5 py-2"
        >
          <span>
            Create <span className="font-medium">{name}</span> from {label}
            {/* Every mapping is named. A port opens a socket on this machine,
                which is the part of this action with a consequence. */}
            {ports.length > 0 && (
              <span data-testid="run-confirm-ports">
                {" "}
                — port{ports.length > 1 ? "s" : ""}{" "}
                {ports.map((p) => `${p.host}:${p.container}`).join(", ")}
              </span>
            )}
            {ports.length === 0 && <span data-testid="run-confirm-noports"> — no ports published</span>}?
          </span>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            data-testid="run-confirm-cancel"
            className="ml-auto rounded-md border border-zinc-200 dark:border-zinc-800 px-2 py-1 text-[11.5px]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void go()}
            data-testid="run-confirm-go"
            className="rounded-md border border-zinc-900 dark:border-zinc-100 bg-zinc-900 dark:bg-zinc-100 px-2 py-1 text-[11.5px] text-white dark:text-zinc-900"
          >
            Create it
          </button>
        </div>
      )}

      {error !== null && (
        <p data-testid="run-error" className="mt-1.5 text-[11.5px] text-zinc-600 dark:text-zinc-300">
          {error}
        </p>
      )}
    </div>
  );
}
