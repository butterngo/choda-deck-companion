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

/** TASK-2401 — breathing room under the last whole item of a snapped list. */
export const SNAP_PAD_PX = 4;

/** TASK-2401 — the height the list box should take so it ends on an item
    boundary: the bottom of the last item (row or group header) that fits whole
    in `area - barPx`, plus SNAP_PAD_PX. Null when the content fits the area
    (no bar, nothing to snap) or nothing fits. Positions are in CONTENT
    coordinates (scroll-independent), so the answer does not move while the
    reader scrolls and does not depend on the box height it sets. */
export function snapHeight(
  list: Pick<
    HTMLElement,
    "getBoundingClientRect" | "scrollTop" | "scrollHeight"
  >,
  items: Iterable<Element>,
  area: number,
  barPx: number,
): number | null {
  if (list.scrollHeight <= area + END_SLACK_PX) return null;
  const avail = area - barPx;
  const top = list.getBoundingClientRect().top - list.scrollTop;
  let fit = 0;
  for (const item of items) {
    const r = item.getBoundingClientRect();
    if (r.height === 0) continue;
    const bottom = r.bottom - top;
    if (bottom <= avail && bottom > fit) fit = bottom;
  }
  return fit > 0 ? Math.ceil(fit) + SNAP_PAD_PX : null;
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
  opts: {
    /** Rows counted in "N more". */
    rows: string;
    /** Items the box may end on (rows and group headers). */
    boundaries: string;
    /** Height of the bar that sits under the box when the list overflows. */
    barPx: number;
  },
): {
  ref: (el: T | null) => void;
  /** Rows below the visible edge; 0 when the reader is at the end. */
  belowCount: number;
  /** Snapped box height in px, or null when the list fits (TASK-2401). The box's
      container is the list's parent element. */
  boxHeight: number | null;
  onScroll: () => void;
  scrollToEnd: () => void;
} {
  const [el, setEl] = useState<T | null>(null);
  const [belowCount, setBelowCount] = useState(0);
  const [boxHeight, setBoxHeight] = useState<number | null>(null);
  const { rows, boundaries, barPx } = opts;

  const measure = useCallback(() => {
    if (el === null) {
      setBelowCount(0);
      return;
    }
    const area = el.parentElement?.clientHeight ?? 0;
    setBoxHeight(snapHeight(el, el.querySelectorAll(boundaries), area, barPx));
    setBelowCount(
      hasMoreBelow(el) ? countBelow(el, el.querySelectorAll(rows)) : 0,
    );
  }, [el, rows, boundaries, barPx]);

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
      if (el.parentElement !== null) ro.observe(el.parentElement);
      for (const child of Array.from(el.children)) ro.observe(child);
    }
    return () => {
      window.removeEventListener("resize", measure);
      ro?.disconnect();
    };
    // boxHeight: once the snapped height lands, count again against the new edge.
  }, [el, measure, boxHeight, ...deps]);

  return { ref: setEl, belowCount, boxHeight, onScroll: measure, scrollToEnd };
}
