// TASK-1875 — look inside a running container.
//
// A directory listing and a file reader, backed by two fixed commands. No
// terminal, no PTY: what Butter asked to see — files, permissions, uid and gid —
// is what `ls -la` prints.
//
// The mode/owner/group columns come from a parse, and the raw line is kept
// beside them. busybox and GNU disagree about spacing, so a row this parser
// cannot read still renders its own text rather than three blanks.

import { useEffect, useState } from "react";
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
}: {
  containerId: string;
  containerName: string;
}): React.JSX.Element {
  const [path, setPath] = useState(ROOT);
  const [entries, setEntries] = useState<ContainerFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [file, setFile] = useState<{ path: string; text: string } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

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

  return (
    <section data-testid="container-files" className="mt-2 flex min-h-0 flex-col gap-1.5">
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
        <ul className="max-h-72 space-y-px overflow-y-auto font-mono text-[11px]">
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
          <pre className="max-h-72 overflow-auto rounded-md border border-zinc-200 dark:border-zinc-800 p-2 font-mono text-[11px] leading-relaxed">
            {file.text}
          </pre>
        </div>
      )}
    </section>
  );
}
