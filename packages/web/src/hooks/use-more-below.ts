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
): {
  ref: (el: T | null) => void;
  moreBelow: boolean;
  onScroll: () => void;
} {
  const [el, setEl] = useState<T | null>(null);
  const [moreBelow, setMoreBelow] = useState(false);

  const measure = useCallback(() => {
    setMoreBelow(el !== null && hasMoreBelow(el));
  }, [el]);

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

  return { ref: setEl, moreBelow, onScroll: measure };
}
