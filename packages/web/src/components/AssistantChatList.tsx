// TASK-2762 — the Assistant's chat list: search, and per-chat Rename / Delete.
//
// Search asks the service (`GET /assistant/chats?q=`), which matches titles and
// message text, 300 ms after the last keystroke; an empty box is the plain list.
// Delete confirms in the page, never with window.confirm — a native dialog
// blocks the whole Electron window. Every action is disabled while a reply is
// streaming, because the service would refuse it with 409 busy.

import { useEffect, useRef, useState } from "react";
import type { AssistantChatSummary } from "../api";

export const SEARCH_DEBOUNCE_MS = 300;

interface Props {
  chats: AssistantChatSummary[];
  /** null while the box is empty; otherwise the service's answer for the query. */
  results: AssistantChatSummary[] | null;
  query: string;
  onQuery: (q: string) => void;
  selectedId: string | null;
  busy: boolean;
  onOpen: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function AssistantChatList(props: Props): React.JSX.Element {
  const { chats, results, query, selectedId, busy } = props;
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const shown = results ?? chats;

  return (
    <nav aria-label="chats" className="min-h-0 overflow-y-auto flex flex-col gap-1">
      <button
        type="button"
        onClick={props.onNew}
        className="mb-2 self-start inline-flex items-center gap-1.5 rounded-md border border-zinc-200 px-2.5 py-1.5 text-sm hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
      >
        <i className="ti ti-plus" aria-hidden="true" />
        New chat
      </button>
      <label className="flex items-center gap-1.5 rounded-md border border-zinc-200 px-2.5 py-1.5 text-sm text-zinc-500 dark:border-zinc-800">
        <i className="ti ti-search" aria-hidden="true" />
        <span className="sr-only">Search chats</span>
        <input
          type="search"
          aria-label="Search chats"
          placeholder="Search chats"
          value={query}
          onChange={(e) => props.onQuery(e.target.value)}
          className="min-w-0 flex-1 bg-transparent text-zinc-900 outline-none dark:text-zinc-100"
        />
      </label>
      {results !== null && (
        <p className="text-xs text-zinc-500 tabular-nums">
          {results.length} {results.length === 1 ? "chat matches" : "chats match"}
        </p>
      )}
      {chats.length === 0 && results === null && <p className="text-xs text-zinc-500">No chats yet.</p>}

      {shown.map((c) => {
        if (renaming?.id === c.id) {
          return (
            <div key={c.id} className="px-2.5 py-1.5">
              <input
                aria-label="Chat title"
                autoFocus
                value={renaming.title}
                onChange={(e) => setRenaming({ id: c.id, title: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setRenaming(null);
                  if (e.key === "Enter") {
                    const title = renaming.title.trim();
                    if (title === "") return;
                    void props.onRename(c.id, title).then(() => setRenaming(null));
                  }
                }}
                className="w-full rounded border border-blue-600 bg-transparent px-1.5 py-0.5 text-sm"
              />
              <span className="block text-xs text-zinc-500 mt-0.5">Enter to save · Esc to cancel</span>
            </div>
          );
        }
        if (confirming === c.id) {
          return (
            <div
              key={c.id}
              role="group"
              aria-label="Confirm delete"
              className="flex flex-col gap-1.5 rounded-md border border-red-200 bg-red-50 px-2.5 py-2 dark:border-red-900 dark:bg-red-950"
            >
              <span className="text-sm">{`Delete "${c.title}"?`}</span>
              <span className="text-xs text-zinc-600 dark:text-zinc-400">{c.id} and its messages are removed for good.</span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => void props.onDelete(c.id).then(() => setConfirming(null))}
                  className="rounded-md bg-red-700 px-2.5 py-1 text-xs text-white"
                >
                  Delete
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(null)}
                  className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs dark:border-zinc-800"
                >
                  Cancel
                </button>
              </div>
            </div>
          );
        }
        return (
          <div
            key={c.id}
            className={`relative flex items-center gap-1 rounded-md pr-1 ${
              c.id === selectedId ? "bg-zinc-100 dark:bg-zinc-800" : "hover:bg-zinc-50 dark:hover:bg-zinc-900"
            }`}
          >
            <button
              type="button"
              aria-current={c.id === selectedId ? "true" : undefined}
              onClick={() => props.onOpen(c.id)}
              className="min-w-0 flex-1 text-left px-2.5 py-1.5 text-sm"
            >
              <span className="block truncate">{c.title}</span>
              <span className="block text-xs text-zinc-500 tabular-nums">
                {c.id} · {c.tokensUsed.toLocaleString()} tokens
              </span>
            </button>
            <button
              type="button"
              aria-label="Chat actions"
              title={`Actions for ${c.id}`}
              aria-expanded={menuFor === c.id}
              disabled={busy}
              onClick={() => setMenuFor((m) => (m === c.id ? null : c.id))}
              className="grid h-7 w-7 flex-none place-items-center rounded-md text-zinc-500 hover:bg-zinc-200 disabled:opacity-40 dark:hover:bg-zinc-700"
            >
              <i className="ti ti-dots" aria-hidden="true" />
            </button>
            {menuFor === c.id && (
              <div
                role="menu"
                className="absolute right-0 top-full z-10 mt-1 flex w-36 flex-col rounded-md border border-zinc-200 bg-white p-1 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
              >
                <button
                  type="button"
                  role="menuitem"
                  disabled={busy}
                  onClick={() => {
                    setMenuFor(null);
                    setRenaming({ id: c.id, title: c.title });
                  }}
                  className="flex items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-zinc-100 disabled:opacity-40 dark:hover:bg-zinc-800"
                >
                  <i className="ti ti-pencil" aria-hidden="true" />
                  Rename
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={busy}
                  onClick={() => {
                    setMenuFor(null);
                    setConfirming(c.id);
                  }}
                  className="flex items-center gap-2 rounded px-2 py-1 text-left text-sm text-red-700 hover:bg-zinc-100 disabled:opacity-40 dark:text-red-400 dark:hover:bg-zinc-800"
                >
                  <i className="ti ti-trash" aria-hidden="true" />
                  Delete
                </button>
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

/** Calls `run` with the query once it has been still for SEARCH_DEBOUNCE_MS. */
export function useDebouncedQuery(query: string, run: (q: string) => void): void {
  const runRef = useRef(run);
  runRef.current = run;
  useEffect(() => {
    if (query.trim() === "") return;
    const t = setTimeout(() => runRef.current(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);
}
