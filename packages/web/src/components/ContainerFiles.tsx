// TASK-1875 — look inside a running container.
//
// A directory listing and a file reader, backed by two fixed commands. No
// terminal, no PTY: what Butter asked to see — files, permissions, uid and gid —
// is what `ls -la` prints.
//
// The mode/owner/group columns come from a parse, and the raw line is kept
// beside them. busybox and GNU disagree about spacing, so a row this parser
// cannot read still renders its own text rather than three blanks.

import { useEffect, useRef, useState } from "react";
import {
  ContainerFileUnreadable,
  ContainerPathError,
  listContainerPath,
  readContainerFile,
} from "../api";
import type { ContainerFile } from "../api";
import { Skeleton } from "./state/Skeleton";

/** Where a listing starts. Root, because an image's layout is not knowable. */
const ROOT = "/";

const parentOf = (p: string): string => {
  const trimmed = p.replace(/\/+$/, "");
  const at = trimmed.lastIndexOf("/");
  return at <= 0 ? ROOT : trimmed.slice(0, at);
};

const join = (dir: string, name: string): string =>
  dir === ROOT ? `/${name}` : `${dir.replace(/\/+$/, "")}/${name}`;

const isDir = (e: ContainerFile): boolean => e.mode.startsWith("d");

export function ContainerFiles({
  containerId,
  containerName,
  onClose,
}: {
  containerId: string;
  containerName: string;
  /** TASK-1896 — dismiss the pane; the row button toggles it too. */
  onClose: () => void;
}): React.JSX.Element {
  const [path, setPath] = useState(ROOT);
  const [entries, setEntries] = useState<ContainerFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [file, setFile] = useState<{ path: string; text: string } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  // TASK-1899 — the overlay. A container's /usr is dozens of entries and a
  // source file is hundreds of lines; neither fits a 288px box.
  const [full, setFull] = useState(false);
  // Where focus goes when the overlay closes, and the flag that says to move
  // it. Calling focus() inside the handler focuses a button in the tree React
  // is about to re-render, so it lands nowhere — the trap DockerLogs already
  // documents.
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const restoreFocus = useRef(false);

  useEffect(() => {
    let live = true;
    setBusy(true);
    setError(null);
    setFile(null);
    setFileError(null);
    listContainerPath(containerId, path)
      .then((e) => {
        if (live) setEntries(e);
      })
      .catch((err: unknown) => {
        if (!live) return;
        setEntries(null);
        setError(
          err instanceof ContainerPathError
            ? `${path} is not there, or this container cannot list it.`
            : "Could not read this container.",
        );
      })
      .finally(() => {
        if (live) setBusy(false);
      });
    return () => {
      live = false;
    };
  }, [containerId, path]);

  // Escape leaves fullscreen here, unlike the terminal (TASK-1889), which
  // deliberately lets the key through to the shell. A file browser has no use
  // for Escape, and it is the first thing a reader tries.
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

  async function open(e: ContainerFile): Promise<void> {
    if (isDir(e)) {
      setPath(join(path, e.name));
      return;
    }
    const target = join(path, e.name);
    setFile(null);
    setFileError(null);
    try {
      setFile({ path: target, text: await readContainerFile(containerId, target) });
    } catch (err) {
      // Both refusals are stated in the reader's terms. "Too large" and "not
      // text" are different facts, and neither is a failure of the app.
      setFileError(
        err instanceof ContainerFileUnreadable
          ? err.why === "too-large"
            ? `${e.name} is too big to show here.`
            : `${e.name} is not text.`
          : `Could not read ${e.name}.`,
      );
    }
  }

  const body = (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
          Inside {containerName}
        </span>
        <code data-testid="cf-path" className="font-mono text-[11.5px] text-zinc-500">
          {path}
        </code>
        {path !== ROOT && (
          <button
            type="button"
            onClick={() => setPath(parentOf(path))}
            data-testid="cf-up"
            className="rounded-md border border-zinc-200 dark:border-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-600 dark:text-zinc-300"
          >
            Up
          </button>
        )}
        <button
          ref={openerRef}
          type="button"
          onClick={() => { if (full) restoreFocus.current = true; setFull((v) => !v); }}
          data-testid="cf-fullscreen"
          className="ml-auto rounded-md border border-zinc-200 dark:border-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
        >
          {full ? "Exit fullscreen (Esc)" : "Fullscreen"}
        </button>
        {/* Close dismisses the PANE, not the overlay — two different exits,
            and both are reachable in fullscreen (TASK-1896). */}
        <button
          type="button"
          onClick={onClose}
          data-testid="cf-close"
          className="rounded-md border border-zinc-200 dark:border-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
        >
          Close
        </button>
      </div>

      {busy && <Skeleton shape="list" label="Reading…" />}

      {!busy && error !== null && (
        <p data-testid="cf-error" className="text-[11.5px] text-zinc-500">
          {error}
        </p>
      )}

      {!busy && error === null && entries !== null && entries.length === 0 && (
        // Stated. An empty directory and a listing that never ran must not
        // render as the same blank area.
        <p data-testid="cf-empty" className="text-[11.5px] text-zinc-500">
          This directory is empty.
        </p>
      )}

      {!busy && entries !== null && entries.length > 0 && (
        <ul
          data-testid="cf-list"
          className={[
            "space-y-px overflow-y-auto font-mono text-[11px]",
            // Half the viewport rather than all of it: in fullscreen an open
            // file shares the screen with the listing that led to it, and a
            // reader comparing the two should not have to scroll between them.
            full ? "max-h-[45vh]" : "max-h-72"
          ].join(" ")}
        >
          {entries.map((e, i) => (
            <li key={`${e.name}-${i}`} data-testid={`cf-row-${e.name}`}>
              <button
                type="button"
                onClick={() => void open(e)}
                className="flex w-full items-center gap-3 rounded px-1.5 py-0.5 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
              >
                {e.mode === "" ? (
                  // The parser did not recognise this dialect. Show what the
                  // container printed rather than three blank columns.
                  <span data-testid={`cf-raw-${e.name}`} className="truncate text-zinc-500">
                    {e.raw}
                  </span>
                ) : (
                  <>
                    <span className="flex-none text-zinc-500">{e.mode}</span>
                    <span
                      data-testid={`cf-owner-${e.name}`}
                      className="flex-none text-zinc-400"
                    >
                      {e.owner}:{e.group}
                    </span>
                    <span className="flex-none tabular-nums text-zinc-400">{e.size}</span>
                    <span className="min-w-0 flex-1 truncate">
                      {e.name}
                      {isDir(e) && "/"}
                    </span>
                  </>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {fileError !== null && (
        <p data-testid="cf-file-error" className="text-[11.5px] text-zinc-500">
          {fileError}
        </p>
      )}

      {file !== null && (
        <div data-testid="cf-file" className="mt-1">
          <p className="mb-1 font-mono text-[10.5px] text-zinc-400">{file.path}</p>
          <pre
            data-testid="cf-file-body"
            className={[
              "overflow-auto rounded-md border border-zinc-200 dark:border-zinc-800 p-2 font-mono text-[11px] leading-relaxed",
              full ? "max-h-[45vh]" : "max-h-72"
            ].join(" ")}
          >
            {file.text}
          </pre>
        </div>
      )}
    </>
  );

  if (!full) {
    return (
      <section data-testid="container-files" className="mt-2 flex min-h-0 flex-col gap-1.5">
        {body}
      </section>
    );
  }

  // Same element with a different className would be enough for the CSS, but
  // the overlay is what a test can point at, and the pane must keep its own
  // testid so TASK-1896's "is it open?" assertions hold in both modes.
  return (
    <section
      data-testid="container-files"
      className="fixed inset-0 z-50 flex flex-col gap-1.5 overflow-auto bg-white p-4 dark:bg-zinc-950"
    >
      <div data-testid="cf-overlay" className="flex min-h-0 flex-col gap-1.5">
        {body}
      </div>
    </section>
  );
}
