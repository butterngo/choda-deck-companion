// TASK-2045 — a full-window reading surface.
//
// The two things worth reading in a meeting row are shown in its smallest boxes:
// a transcript scrolling inside `max-h-80`, and a note as raw text in a 16-row
// textarea. This gives either one the whole window without unmounting anything
// behind it — which matters more than it sounds, because the row below holds the
// <audio> elements the transcript's ▶ stamps drive, and the note draft the user
// may have spent minutes editing.
//
// So this deliberately does NOT use a portal or a <dialog>. It renders in place,
// as a fixed-position sibling: the tree behind it stays mounted, keeps its state,
// and keeps playing.
import { useEffect, useRef } from "react";

/** Everything that can hold focus inside the overlay. */
const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function FullscreenOverlay({
  title,
  onClose,
  children,
  testId,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  testId?: string;
}): React.JSX.Element {
  const panel = useRef<HTMLDivElement | null>(null);
  // Captured on mount, before focus moves inside: closing must put the caret
  // back where the user left it, not at the top of the document.
  const opener = useRef<Element | null>(typeof document === "undefined" ? null : document.activeElement);

  useEffect(() => {
    const restoreTo = opener.current;

    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panel.current) return;

      // Focus trap. Without it, Tab walks out of the overlay into the row behind
      // it — controls the user cannot see and did not mean to reach.
      // Hidden-ness is judged by the `hidden` attribute, NOT by offsetParent:
      // offsetParent needs layout, and in an environment without it (jsdom, and
      // any headless render) it is null for everything — which would filter the
      // whole list away and silently turn this trap into a no-op.
      const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.closest("[hidden]") === null,
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    panel.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (restoreTo instanceof HTMLElement && document.contains(restoreTo)) restoreTo.focus();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-zinc-950"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-testid={testId ?? "fullscreen-overlay"}
      ref={panel}
    >
      <div className="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-800 px-4 py-2.5">
        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{title}</span>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          data-testid="fullscreen-close"
        >
          Close
          <span className="ml-1.5 text-zinc-400">Esc</span>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3">{children}</div>
    </div>
  );
}
