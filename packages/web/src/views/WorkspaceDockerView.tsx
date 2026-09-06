// TASK-1865 — what is running for this workspace.
//
// The list loads on open because it is cheap and it reaches no provider: 206 ms
// over this machine's real 25 containers, measured rather than hoped. That is
// what makes this a tab instead of a button.
//
// Two states this view is careful about, because both are easy to render as the
// same nothing:
//
//   * Docker absent — a capability note, never an error. A machine that does no
//     container work is not a machine with a bug.
//   * A workspace with no containers — a stated "none", never an empty pane.
//     The distinction the Setup verdict strip exists to make.

import { useEffect, useState } from "react";
import { DockerUnavailableError, fetchDockerContainers, fetchDockerLogs } from "../api";
import type { DockerContainer } from "../api";
import { CapabilityNote } from "../components/state/CapabilityNote";
import { ErrorState } from "../components/state/ErrorState";
import { Skeleton } from "../components/state/Skeleton";

const RUNNING = (c: DockerContainer): boolean => c.state === "running";

export function WorkspaceDockerView({ workspaceId }: { workspaceId: string }): React.JSX.Element {
  const [all, setAll] = useState<DockerContainer[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [failed, setFailed] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[] | null>(null);
  const [logsBusy, setLogsBusy] = useState(false);

  // Above every early return. Placing a hook below one shipped React #310 in
  // 0.9.7 and blanked a whole tab.
  useEffect(() => {
    const ac = new AbortController();
    fetchDockerContainers(ac.signal)
      .then(setAll)
      .catch((err: unknown) => {
        if (ac.signal.aborted) return;
        if (err instanceof DockerUnavailableError) setUnavailable(true);
        else setFailed(true);
      });
    return () => {
      ac.abort();
    };
  }, []);

  async function openLogs(c: DockerContainer): Promise<void> {
    setOpenId(c.id);
    setLogs(null);
    setLogsBusy(true);
    try {
      setLogs(await fetchDockerLogs(c.id));
    } catch {
      setLogs([]);
    } finally {
      setLogsBusy(false);
    }
  }

  if (unavailable) {
    return (
      <CapabilityNote icon="ti-brand-docker">
        <span data-testid="docker-unavailable">
          <span className="font-medium text-zinc-900 dark:text-zinc-100">
            Docker is not running.
          </span>{" "}
          Start it and this tab will list the containers for this workspace, matched by the
          compose project directory.
        </span>
      </CapabilityNote>
    );
  }
  if (failed) return <ErrorState variant="failed" subject="the container list" />;
  if (all === null) return <Skeleton shape="list" label="Reading containers…" />;

  const mine = all.filter((c) => c.workspaceId === workspaceId);
  const unattached = all.filter((c) => c.workspaceId === null);
  const running = mine.filter(RUNNING).length;

  const Row = ({ c }: { c: DockerContainer }): React.JSX.Element => (
    <li
      data-testid={`docker-row-${c.name}`}
      data-state={c.state}
      className="flex items-center gap-2 rounded-md border border-zinc-200 dark:border-zinc-800 px-2.5 py-1.5"
    >
      <span
        aria-hidden="true"
        className={[
          "h-1.5 w-1.5 flex-none rounded-full",
          RUNNING(c) ? "bg-green-600 dark:bg-green-400" : "bg-zinc-400 dark:bg-zinc-600",
        ].join(" ")}
      />
      <span className="min-w-0 flex-1 truncate text-[13.5px]">{c.name}</span>
      <span className="flex-none truncate font-mono text-[10.5px] text-zinc-400">{c.image}</span>
      <span className="flex-none text-[11px] text-zinc-500">{c.status}</span>
      <button
        type="button"
        onClick={() => void openLogs(c)}
        data-testid={`docker-logs-${c.name}`}
        className="flex-none rounded-md border border-zinc-200 dark:border-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
      >
        Logs
      </button>
    </li>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <p data-testid="docker-verdict" className="text-[11.5px] tabular-nums text-zinc-500">
        <span className="font-medium text-zinc-900 dark:text-zinc-100">{mine.length}</span>{" "}
        {mine.length === 1 ? "container" : "containers"} for this workspace
        {mine.length > 0 && <> · {running} running</>}
      </p>

      {mine.length === 0 ? (
        // Stated, not empty. "No containers" and "we did not look" must not
        // render as the same blank area.
        <p data-testid="docker-none" className="text-[12.5px] text-zinc-500">
          No containers are attached to this workspace. A container is attached when it was
          started by <code className="font-mono text-[11.5px]">docker compose</code> from this
          directory.
        </p>
      ) : (
        <ul className="space-y-1">
          {mine.map((c) => (
            <Row key={c.id} c={c} />
          ))}
        </ul>
      )}

      {unattached.length > 0 && (
        <section data-testid="docker-unattached" className="mt-2">
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
            Unattached · {unattached.length}
          </p>
          {/* Listed, never attributed. These carry no compose label, and giving
              them a workspace would render a guess as a fact. On this machine
              that is 8 of every 12 containers. */}
          <p className="mb-1.5 text-[11px] text-zinc-500">
            Started outside compose, so there is nothing on them that says which project they
            belong to.
          </p>
          <ul className="space-y-1">
            {unattached.map((c) => (
              <Row key={c.id} c={c} />
            ))}
          </ul>
        </section>
      )}

      {openId !== null && (
        <section data-testid="docker-logs-pane" className="mt-2 min-h-0">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
            Logs · last 200 lines
          </p>
          {logsBusy && <Skeleton shape="list" label="Reading logs…" />}
          {!logsBusy && logs !== null && logs.length === 0 && (
            <p data-testid="docker-logs-empty" className="text-[11.5px] text-zinc-500">
              This container has written nothing.
            </p>
          )}
          {!logsBusy && logs !== null && logs.length > 0 && (
            <pre className="max-h-72 overflow-auto rounded-md border border-zinc-200 dark:border-zinc-800 p-2 font-mono text-[11px] leading-relaxed">
              {logs.join("\n")}
            </pre>
          )}
        </section>
      )}
    </div>
  );
}
