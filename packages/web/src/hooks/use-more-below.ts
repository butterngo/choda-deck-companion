// TASK-2376 — does a scroll container have content below its visible edge?
//
// The project list scrolls, but at rest its last visible row was simply cut by
// the bottom edge, which reads as a clipping bug rather than "there is more".
// This answers that one question so the view can draw a fade only when it is
// true, and drop it once the reader has reached the end.

import { useCallback, useEffect, useState } from "react";

/** A row this close to the edge counts as the end — sub-pixel scroll offsets
    never quite reach zero on scaled displays. */
const END_SLACK_PX = 2;

/** TASK-2400 — how many rows end below the container's visible bottom, i.e.
    are cut or entirely out of view. A row inside a collapsed (display:none)
    group has an all-zero rect and is never counted. */
export function countBelow(
  container: Pick<HTMLElement, "getBoundingClientRect">,
  rows: Iterable<Element>,
): number {
  const edge = container.getBoundingClientRect().bottom;
  let n = 0;
  for (const row of rows) {
    const r = row.getBoundingClientRect();
    if (r.height > 0 && r.bottom > edge + END_SLACK_PX) n += 1;
  }
  return n;
}

export function hasMoreBelow(
  el: Pick<HTMLElement, "scrollHeight" | "scrollTop" | "clientHeight">,
): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight > END_SLACK_PX;
}

/** `deps` are whatever changes WHICH children the list has (rows, collapsed
    groups).

    The element is tracked through a callback ref, not useRef: the list mounts
    only once the adapter reports healthy, often after the projects are already
    in cache, so an effect keyed on the rows ran while the ref was still null
    and never measured — in the browser the cue was missing on most loads. Size
    changes are watched with a ResizeObserver on the list and each child, since
    layout settling or a group toggle fires no scroll event. */
export function useMoreBelow<T extends HTMLElement>(
  deps: readonly unknown[],
  rowSelector: string,
): {
  ref: (el: T | null) => void;
  /** Rows below the visible edge; 0 when the reader is at the end. */
  belowCount: number;
  onScroll: () => void;
  scrollToEnd: () => void;
} {
  const [el, setEl] = useState<T | null>(null);
  const [belowCount, setBelowCount] = useState(0);

  const measure = useCallback(() => {
    setBelowCount(
      el !== null && hasMoreBelow(el)
        ? countBelow(el, el.querySelectorAll(rowSelector))
        : 0,
    );
  }, [el, rowSelector]);

  const scrollToEnd = useCallback(() => {
    if (el === null) return;
    el.scrollTop = el.scrollHeight;
    measure();
  }, [el, measure]);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    // jsdom has no ResizeObserver; there the scroll + resize paths are all there is.
    const ro =
      typeof ResizeObserver === "undefined" || el === null
        ? null
        : new ResizeObserver(measure);
    if (ro !== null && el !== null) {
      ro.observe(el);
      for (const child of Array.from(el.children)) ro.observe(child);
    }
    return () => {
      window.removeEventListener("resize", measure);
      ro?.disconnect();
    };
  }, [el, measure, ...deps]);

  return { ref: setEl, belowCount, onScroll: measure, scrollToEnd };
}
