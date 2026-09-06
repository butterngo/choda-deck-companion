// TASK-1873 — images, and getting rid of the ones nothing needs.
//
// Removal is irreversible in a way stopping a container is not: an image that is
// not in a registry has to be rebuilt. So the confirmation names the image AND
// its size, and an image a container holds is not offered for removal at all —
// the adapter would refuse it, and offering a button that is going to be
// refused is worse than not offering one.

import { useEffect, useState } from "react";
import {
  DockerUnavailableError,
  ImageInUseError,
  fetchDockerImages,
  pruneDockerImages,
  removeDockerImage,
} from "../api";
import type { DockerImage } from "../api";
import { CapabilityNote } from "./state/CapabilityNote";
import { Skeleton } from "./state/Skeleton";

export function DockerImages(): React.JSX.Element {
  const [images, setImages] = useState<DockerImage[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState<DockerImage | null>(null);
  const [pruning, setPruning] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Above every early return, for the reason 0.9.7 shipped a blank tab.
  useEffect(() => {
    const ac = new AbortController();
    void reload(ac.signal);
    return () => {
      ac.abort();
    };
  }, []);

  async function reload(signal?: AbortSignal): Promise<void> {
    try {
      setImages(await fetchDockerImages(signal));
    } catch (err) {
      if (signal?.aborted) return;
      if (err instanceof DockerUnavailableError) setUnavailable(true);
      else setFailed(true);
    }
  }

  async function confirmRemove(): Promise<void> {
    if (pending === null) return;
    const img = pending;
    setPending(null);
    setBusy(true);
    setNote(null);
    try {
      const out = await removeDockerImage(img.id);
      setNote(`Removed ${label(img)} — ${out.freed} freed.`);
    } catch (err) {
      if (err instanceof ImageInUseError) {
        setNote(`${label(img)} is held by ${err.by.join(", ")}. Stop or remove those first.`);
      } else {
        setNote(`Could not remove ${label(img)}.`);
      }
    } finally {
      // Re-read from the daemon rather than dropping the row locally: a removal
      // that partially failed would otherwise look like a success.
      await reload();
      setBusy(false);
    }
  }

  async function doPrune(): Promise<void> {
    setPruning(false);
    setBusy(true);
    setNote(null);
    try {
      const out = await pruneDockerImages();
      // Zero is stated, because a silent success is indistinguishable from a
      // prune that found nothing to do.
      setNote(
        out.removed === 0
          ? "Nothing to prune — no untagged layers."
          : `Pruned ${out.removed} — ${out.freed} freed.`,
      );
    } catch {
      setNote("Could not prune.");
    } finally {
      await reload();
      setBusy(false);
    }
  }

  if (unavailable) {
    return (
      <CapabilityNote icon="ti-brand-docker">
        <span data-testid="images-unavailable">Docker is not running.</span>
      </CapabilityNote>
    );
  }
  if (failed) {
    return (
      <p data-testid="images-failed" className="text-[12.5px] text-zinc-500">
        Could not read the image list.
      </p>
    );
  }
  if (images === null) return <Skeleton shape="list" label="Reading images…" />;

  const free = images.filter((i) => i.inUseBy.length === 0);

  return (
    <section data-testid="docker-images" className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3 border-b border-zinc-200 dark:border-zinc-800 pb-2">
        <span data-testid="images-verdict" className="text-[11.5px] tabular-nums text-zinc-500">
          <span className="font-medium text-zinc-900 dark:text-zinc-100">{images.length}</span> images ·{" "}
          {free.length} removable
        </span>
        <button
          type="button"
          onClick={() => setPruning(true)}
          disabled={busy}
          data-testid="images-prune"
          className="ml-auto rounded-md border border-zinc-200 dark:border-zinc-800 px-2 py-1 text-[11.5px] text-zinc-600 dark:text-zinc-300 disabled:opacity-40"
        >
          Prune untagged
        </button>
      </div>

      {pruning && (
        <div
          data-testid="images-prune-confirm"
          className="flex flex-wrap items-center gap-2 rounded-md border border-amber-300 dark:border-amber-800 px-2.5 py-2 text-[12.5px]"
        >
          <span>Remove every untagged image? This cannot be undone.</span>
          <button
            type="button"
            onClick={() => setPruning(false)}
            data-testid="images-prune-cancel"
            className="ml-auto rounded-md border border-zinc-200 dark:border-zinc-800 px-2 py-1 text-[11.5px]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void doPrune()}
            data-testid="images-prune-go"
            className="rounded-md border border-zinc-900 dark:border-zinc-100 bg-zinc-900 dark:bg-zinc-100 px-2 py-1 text-[11.5px] text-white dark:text-zinc-900"
          >
            Prune
          </button>
        </div>
      )}

      {pending !== null && (
        <div
          data-testid="images-confirm"
          className="flex flex-wrap items-center gap-2 rounded-md border border-amber-300 dark:border-amber-800 px-2.5 py-2 text-[12.5px]"
        >
          {/* The size is named because it is the reason a reader is doing this,
              and because it is the thing they lose if they are wrong. */}
          <span>
            Remove <span className="font-medium">{label(pending)}</span> ({pending.size})? Rebuilding
            it is the only way back.
          </span>
          <button
            type="button"
            onClick={() => setPending(null)}
            data-testid="images-confirm-cancel"
            className="ml-auto rounded-md border border-zinc-200 dark:border-zinc-800 px-2 py-1 text-[11.5px]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void confirmRemove()}
            data-testid="images-confirm-go"
            className="rounded-md border border-zinc-900 dark:border-zinc-100 bg-zinc-900 dark:bg-zinc-100 px-2 py-1 text-[11.5px] text-white dark:text-zinc-900"
          >
            Remove it
          </button>
        </div>
      )}

      {note !== null && (
        <p data-testid="images-note" className="text-[11.5px] text-zinc-600 dark:text-zinc-300">
          {note}
        </p>
      )}

      {images.length === 0 ? (
        <p data-testid="images-none" className="text-[12.5px] text-zinc-500">
          The daemon reports no images.
        </p>
      ) : (
        <ul className="space-y-1 overflow-y-auto">
          {images.map((i) => (
            <li
              key={i.id}
              data-testid={`image-row-${i.id}`}
              data-inuse={i.inUseBy.length > 0 ? "true" : "false"}
              className="flex items-center gap-2 rounded-md border border-zinc-200 dark:border-zinc-800 px-2.5 py-1.5"
            >
              <span className="min-w-0 flex-1 truncate text-[13px]">{label(i)}</span>
              <span className="flex-none tabular-nums text-[11px] text-zinc-500">{i.size}</span>
              {i.inUseBy.length > 0 ? (
                // No button at all. Offering one that the adapter is going to
                // refuse is worse than offering none, and the reason is here
                // rather than behind a click.
                <span
                  data-testid={`image-held-${i.id}`}
                  className="flex-none truncate text-[10.5px] text-zinc-500"
                >
                  used by {i.inUseBy.join(", ")}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setPending(i)}
                  disabled={busy}
                  data-testid={`image-remove-${i.id}`}
                  className="flex-none rounded-md border border-amber-300 dark:border-amber-800 px-1.5 py-0.5 text-[11px] text-amber-700 dark:text-amber-300 disabled:opacity-40"
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const label = (i: DockerImage): string =>
  i.repository === "<none>" ? `<untagged> ${i.id.slice(0, 12)}` : `${i.repository}:${i.tag}`;
