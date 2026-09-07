// TASK-1872 — logs you can actually read.
//
// The pane showed the last 200 lines in a 288px box: enough to confirm a
// container started, useless for finding anything.
//
// Search runs over lines already fetched and issues no request. That is not a
// performance nicety — a keystroke that refetches is the same defect TASK-1844
// AC-5 forbade for validation, and here it would hit a route that shells out to
// docker on every character.

import { useEffect, useRef, useState } from "react";
import { fetchDockerLogs } from "../api";
import { Skeleton } from "./state/Skeleton";

const TAILS = [200, 1000] as const;
type Tail = (typeof TAILS)[number];

/** The line split into before / match / after, or null when it does not match. */
function split(line: string, needle: string): [string, string, string] | null {
  if (needle === "") return [line, "", ""];
  const at = line.toLowerCase().indexOf(needle.toLowerCase());
  if (at === -1) return null;
  return [line.slice(0, at), line.slice(at, at + needle.length), line.slice(at + needle.length)];
}

export function DockerLogs({
  containerId,
  containerName,
  onClose,
}: {
  containerId: string;
  containerName: string;
  /** TASK-1896 — dismiss the pane. The row button toggles too, but a toggle
      does not announce itself, and the reader is looking AT the pane. */
  onClose: () => void;
}): React.JSX.Element {
  const [lines, setLines] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(true);
  // TASK-1893 — a re-read of the SAME (container, tail). Bumping this is what
  // re-runs the effect; calling the fetch from the click handler instead would
  // be a second code path to the same route, and the two would drift.
  const [nonce, setNonce] = useState(0);
  // Separate from `busy`: a refresh keeps the lines it already has on screen,
  // so the skeleton must not come back and hide them.
  const [refreshing, setRefreshing] = useState(false);
  // A refresh that failed. The lines beside it are the PREVIOUS read's, and
  // saying so is the difference between stale data and a lie.
  const [staleAfterFailure, setStale] = useState(false);
  const [tail, setTail] = useState<Tail>(200);
  const [query, setQuery] = useState("");
  const [full, setFull] = useState(false);
  // Where focus goes when the overlay closes. Losing it to the body strands a
  // keyboard reader on a page with no obvious next stop.
  const openerRef = useRef<HTMLButtonElement | null>(null);
  // Set when the overlay is dismissed, consumed after the re-render. Calling
  // focus() inside the handler focuses the button in the tree React is about
  // to unmount, so the focus lands nowhere and the reader is stranded.
  const restoreFocus = useRef(false);

  useEffect(() => {
    let live = true;
    // The first read of a container blanks the pane and shows a skeleton; a
    // refresh does not, because there is already something true on screen.
    // Safe as an identity for "not the first read" because the caller keys this
    // component by container id — a different container is a different instance
    // with its own nonce, not this one carrying a stale count into a new log.
    const isRefresh = nonce > 0;
    if (isRefresh) setRefreshing(true);
    else setBusy(true);
    fetchDockerLogs(containerId, tail)
      .then((l) => {
        if (!live) return;
        // Assigned, never appended. A container that was restarted has FEWER
        // lines than before, and a concatenation would render lines that are
        // no longer in the log as if they still were.
        setLines(l);
        setStale(false);
      })
      .catch(() => {
        if (!live) return;
        // On a refresh the previous lines stay. Clearing them would throw away
        // the only true thing the pane still holds because a later read failed.
        if (isRefresh) setStale(true);
        else setLines([]);
      })
      .finally(() => {
        if (!live) return;
        setBusy(false);
        setRefreshing(false);
      });
    return () => {
      live = false;
    };
  }, [containerId, tail, nonce]);

  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        restoreFocus.current = true;
        setFull(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [full]);

  useEffect(() => {
    if (full || !restoreFocus.current) return;
    restoreFocus.current = false;
    openerRef.current?.focus();
  }, [full]);

  const all = lines ?? [];
  const shown = all
    .map((l) => ({ l, parts: split(l, query) }))
    .filter((x): x is { l: string; parts: [string, string, string] } => x.parts !== null);

  const body = (
    <>
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
          Logs · {containerName}
        </span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search these lines"
          aria-label="Search logs"
          data-testid="docker-logs-search"
          className="w-52 rounded-md border border-zinc-200 dark:border-zinc-800 bg-transparent px-2 py-1 text-[11.5px] text-zinc-700 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
        />
        {query !== "" && (
          // The count is what separates "nothing matches" from "nothing was
          // logged". Without it the two render as the same empty box.
          <span data-testid="docker-logs-count" className="text-[11px] tabular-nums text-zinc-500">
            {shown.length} of {all.length}
          </span>
        )}
        <select
          value={tail}
          onChange={(e) => setTail(Number(e.target.value) as Tail)}
          aria-label="Lines to read"
          data-testid="docker-logs-tail"
          className="rounded-md border border-zinc-200 dark:border-zinc-800 bg-transparent px-1.5 py-1 text-[11px] text-zinc-600 dark:text-zinc-300"
        >
          {TAILS.map((t) => (
            <option key={t} value={t}>
              last {t}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setNonce((n) => n + 1)}
          // Guarded, not just styled: two clicks must not put two reads of the
          // same tail in flight, each shelling out to docker.
          disabled={busy || refreshing}
          data-testid="docker-logs-refresh"
          className="rounded-md border border-zinc-200 dark:border-zinc-800 px-2 py-1 text-[11px] text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 disabled:opacity-40"
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
        <button
          type="button"
          onClick={onClose}
          data-testid="docker-logs-close"
          className="rounded-md border border-zinc-200 dark:border-zinc-800 px-2 py-1 text-[11px] text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
        >
          Close
        </button>
        <button
          ref={openerRef}
          type="button"
          onClick={() => { if (full) restoreFocus.current = true; setFull((v) => !v); }}
          data-testid="docker-logs-fullscreen"
          className="ml-auto rounded-md border border-zinc-200 dark:border-zinc-800 px-2 py-1 text-[11px] text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
        >
          {full ? "Exit fullscreen (Esc)" : "Fullscreen"}
        </button>
      </div>

      {busy && <Skeleton shape="list" label="Reading logs…" />}

      {staleAfterFailure && (
        // Two facts, two renderings: these lines are real, and the attempt to
        // replace them failed. An error state that swallowed the lines would
        // lose both.
        <p
          data-testid="docker-logs-stale"
          className="mb-1.5 text-[11.5px] text-amber-700 dark:text-amber-300"
        >
          Could not re-read the log. These are the lines from the last successful read.
        </p>
      )}

      {!busy && all.length === 0 && (
        <p data-testid="docker-logs-empty" className="text-[11.5px] text-zinc-500">
          This container has written nothing.
        </p>
      )}

      {!busy && all.length > 0 && shown.length === 0 && (
        // Stated, because an empty area here would read as "no logs" when the
        // truth is "no lines match".
        <p data-testid="docker-logs-nomatch" className="text-[11.5px] text-zinc-500">
          No lines match “{query}”.
        </p>
      )}

      {!busy && shown.length > 0 && (
        <pre
          data-testid="docker-logs-body"
          className={[
            "overflow-auto rounded-md border border-zinc-200 dark:border-zinc-800 p-2 font-mono text-[11px] leading-relaxed",
            full ? "h-[calc(100vh-8rem)]" : "max-h-72",
          ].join(" ")}
        >
          {shown.map((x, i) => (
            <div key={i} data-testid="docker-logs-line">
              {x.parts[1] === "" ? (
                x.l
              ) : (
                <>
                  {x.parts[0]}
                  {/* Marked, so a reader does not re-scan a 200-character line
                      by eye to find what they searched for. */}
                  <mark
                    data-testid="docker-logs-hit"
                    className="bg-amber-200 text-zinc-900 dark:bg-amber-500/40 dark:text-zinc-100"
                  >
                    {x.parts[1]}
                  </mark>
                  {x.parts[2]}
                </>
              )}
            </div>
          ))}
        </pre>
      )}
    </>
  );

  if (!full) {
    return (
      <section data-testid="docker-logs-pane" className="mt-2 min-h-0">
        {body}
      </section>
    );
  }

  return (
    <section
      data-testid="docker-logs-pane"
      className="fixed inset-0 z-50 overflow-auto bg-white p-4 dark:bg-zinc-950"
    >
      <div data-testid="docker-logs-overlay">{body}</div>
    </section>
  );
}
