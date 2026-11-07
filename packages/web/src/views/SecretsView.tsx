// Quick access to the credentials each workspace keeps in `sensitive_information/`.
//
// Getting one used to mean Explorer → project → folder → file → select. Here the
// list is names only (workspace, file, key) from the main process; Copy puts the
// value on the clipboard without it ever reaching this page, and the eye icon
// fetches one value on demand, shows it for REVEAL_SECONDS and drops it.
//
// Opening the page reads no file: it lists folders only (which workspaces have
// secrets, and their file names), and pinned rows render from the pin itself.
// A workspace group starts collapsed and reads its files the first time it is
// opened. Search matches workspace and file names straight away and opens the
// groups that match; key names match once a group has loaded.
//
// Pins are a per-machine convenience, so they live in localStorage.

import { useCallback, useEffect, useRef, useState } from "react";
import { EmptyState } from "../components/state/EmptyState";
import { ErrorState } from "../components/state/ErrorState";
import { Skeleton } from "../components/state/Skeleton";
import { useWorkspaces } from "../hooks/use-workspaces";

export interface SecretEntry {
  workspaceId: string;
  workspaceLabel: string;
  file: string;
  /** "" for a single-value file. */
  key: string;
}

export interface WorkspaceFiles {
  workspaceId: string;
  workspaceLabel: string;
  files: string[];
}

interface SecretsBridge {
  listSecretFiles: () => Promise<{ ok: boolean; reason?: string; workspaces?: WorkspaceFiles[] }>;
  listSecrets: (
    workspaceId: string
  ) => Promise<{ ok: boolean; reason?: string; entries?: SecretEntry[] }>;
  copySecret: (
    workspaceId: string,
    file: string,
    key: string
  ) => Promise<{ ok: boolean; reason?: string; clearsInSeconds?: number }>;
  revealSecret: (
    workspaceId: string,
    file: string,
    key: string
  ) => Promise<{ ok: boolean; reason?: string; value?: string }>;
  saveSecret: (
    workspaceId: string,
    file: string,
    kind: "token" | "cookie",
    value: string
  ) => Promise<{ ok: boolean; reason?: string }>;
  deleteSecret: (workspaceId: string, file: string) => Promise<{ ok: boolean; reason?: string }>;
}

/** The packaged app's bridge; absent in the browser shell. */
function bridge(): SecretsBridge | null {
  const w = window as unknown as { choda?: Partial<SecretsBridge> };
  const c = w.choda;
  return typeof c?.listSecretFiles === "function" &&
    typeof c.listSecrets === "function" &&
    typeof c.copySecret === "function" &&
    typeof c.revealSecret === "function" &&
    typeof c.saveSecret === "function" &&
    typeof c.deleteSecret === "function"
    ? (c as SecretsBridge)
    : null;
}

const PIN_KEY = "choda.secrets.pins";
const REVEAL_SECONDS = 10;

export function secretId(e: SecretEntry): string {
  return `${e.workspaceId}|${e.file}|${e.key}`;
}

/** A pin carries everything a row needs, so pinned rows render without a read. */
function entryFromId(id: string, labels: ReadonlyMap<string, string>): SecretEntry | null {
  const first = id.indexOf("|");
  const last = id.lastIndexOf("|");
  if (first <= 0 || last === first) return null;
  const workspaceId = id.slice(0, first);
  return {
    workspaceId,
    workspaceLabel: labels.get(workspaceId) ?? workspaceId,
    file: id.slice(first + 1, last),
    key: id.slice(last + 1),
  };
}

function matches(e: SecretEntry, q: string): boolean {
  return !q || `${e.workspaceLabel} ${e.file} ${e.key}`.toLowerCase().includes(q);
}

function displayName(e: SecretEntry): string {
  return e.file.replace(/\.(txt|token|cookie)$/i, "");
}

function readPins(): string[] {
  try {
    const raw = window.localStorage.getItem(PIN_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === "string") : [];
  } catch {
    return [];
  }
}

function writePins(pins: string[]): void {
  try {
    window.localStorage.setItem(PIN_KEY, JSON.stringify(pins));
  } catch {
    // Storage blocked — pins just do not survive a restart.
  }
}

type Revealed = Record<string, { value: string; left: number }>;
type GroupState = SecretEntry[] | "loading" | { error: string };

function SecretRow({
  entry,
  showWorkspace,
  pinned,
  revealed,
  onTogglePin,
  onToggleReveal,
  onCopy,
  onSaveEdit,
  onDelete,
}: {
  entry: SecretEntry;
  showWorkspace: boolean;
  pinned: boolean;
  revealed?: { value: string; left: number };
  onTogglePin: () => void;
  onToggleReveal: () => void;
  onCopy: () => Promise<boolean>;
  onSaveEdit: (value: string) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
}): React.JSX.Element {
  const [copied, setCopied] = useState(false);
  // "edit" opens an empty overwrite field; "confirm" is the two-step delete.
  const [mode, setMode] = useState<"idle" | "edit" | "confirm">("idle");
  const [editValue, setEditValue] = useState("");
  const name = displayName(entry);
  const what = entry.key ? `${name} ${entry.key}` : name;
  const iconBtn =
    "grid place-items-center w-7 h-7 rounded-md text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-white dark:hover:bg-zinc-900 border border-transparent hover:border-zinc-200 dark:hover:border-zinc-700";

  return (
    <div
      data-testid="secret-row"
      className={[
        "grid grid-cols-[20px_minmax(0,1fr)_auto_auto] items-center gap-2.5 px-3 py-2 border-t first:border-t-0 border-zinc-100 dark:border-zinc-800",
        pinned
          ? "bg-amber-50/60 dark:bg-amber-950/20"
          : "hover:bg-zinc-50 dark:hover:bg-zinc-800/40",
      ].join(" ")}
    >
      <i className="ti ti-key text-zinc-400" aria-hidden="true" />
      <div className="min-w-0 flex flex-col gap-0.5">
        <div className="flex items-center gap-1.5 flex-wrap font-medium text-sm">
          {name}
          {entry.key && (
            <span className="font-mono text-[11px] font-normal px-1.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
              {entry.key}
            </span>
          )}
        </div>
        <div className="font-mono text-[11px] text-zinc-400 truncate">
          {showWorkspace ? `${entry.workspaceLabel} · ` : ""}sensitive_information/{entry.file}
        </div>
      </div>
      {revealed ? (
        <span className="text-[11px] tabular-nums text-blue-600 dark:text-blue-400">
          hides in {revealed.left}s
        </span>
      ) : (
        <span className="hidden sm:inline font-mono text-xs tracking-widest text-zinc-400" aria-hidden="true">
          ••••••••
        </span>
      )}
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-pressed={!!revealed}
          aria-label={`${revealed ? "Hide" : "Show"} ${what}`}
          title={revealed ? "Hide" : `Show for ${REVEAL_SECONDS}s`}
          onClick={onToggleReveal}
          className={`${iconBtn} ${revealed ? "text-blue-600 dark:text-blue-400" : ""}`}
        >
          <i className={`ti ${revealed ? "ti-eye-off" : "ti-eye"}`} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={`Copy ${what}`}
          onClick={() => {
            void onCopy().then((ok) => {
              if (!ok) return;
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            });
          }}
          className={[
            "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-xs",
            copied
              ? "border-green-600 text-green-700 bg-green-50 dark:border-green-500 dark:text-green-400 dark:bg-green-950/40"
              : "border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400",
          ].join(" ")}
        >
          <i className={`ti ${copied ? "ti-check" : "ti-copy"}`} aria-hidden="true" />
          {copied ? "Copied" : "Copy"}
        </button>
        <button
          type="button"
          aria-pressed={pinned}
          aria-label={`${pinned ? "Unpin" : "Pin"} ${what}`}
          title={pinned ? "Unpin" : "Pin"}
          onClick={onTogglePin}
          className={`${iconBtn} ${pinned ? "text-amber-600 dark:text-amber-400" : ""}`}
        >
          <i className={`ti ${pinned ? "ti-pinned-filled" : "ti-pin"}`} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={`Edit ${what}`}
          title="Replace the value"
          onClick={() => {
            setMode((m) => (m === "edit" ? "idle" : "edit"));
            setEditValue("");
          }}
          className={`${iconBtn} ${mode === "edit" ? "text-blue-600 dark:text-blue-400" : ""}`}
        >
          <i className="ti ti-pencil" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={`Delete ${what}`}
          title="Delete this file"
          onClick={() => setMode((m) => (m === "confirm" ? "idle" : "confirm"))}
          className={`${iconBtn} ${mode === "confirm" ? "text-rose-600 dark:text-rose-400" : ""}`}
        >
          <i className="ti ti-trash" aria-hidden="true" />
        </button>
      </div>
      {mode === "edit" && (
        <div className="col-span-full flex flex-col gap-2 rounded-md border border-dashed border-blue-400 dark:border-blue-500/60 bg-zinc-50 dark:bg-zinc-900 p-2.5">
          <label className="text-[11px] text-zinc-500 dark:text-zinc-400">
            Overwrite <code className="font-mono">sensitive_information/{entry.file}</code> — paste the new value
          </label>
          <textarea
            aria-label={`New value for ${what}`}
            value={editValue}
            spellCheck={false}
            onChange={(ev) => setEditValue(ev.target.value)}
            className="w-full min-h-[64px] resize-y rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 p-2 font-mono text-xs"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setMode("idle")}
              className="h-7 rounded-md border border-zinc-200 dark:border-zinc-700 px-2.5 text-xs"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={editValue.trim() === ""}
              onClick={() => {
                void onSaveEdit(editValue).then((ok) => {
                  if (ok) setMode("idle");
                });
              }}
              className="h-7 rounded-md border border-blue-600 bg-blue-600 px-2.5 text-xs text-white disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </div>
      )}
      {mode === "confirm" && (
        <div className="col-span-full flex items-center justify-between gap-3 rounded-md border border-rose-300 dark:border-rose-500/50 bg-rose-50 dark:bg-rose-950/30 px-3 py-2 text-xs">
          <span className="text-rose-800 dark:text-rose-300">
            Delete <code className="font-mono">{entry.file}</code> from disk?
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode("idle")}
              className="h-7 rounded-md border border-zinc-200 dark:border-zinc-700 px-2.5"
            >
              Cancel
            </button>
            <button
              type="button"
              aria-label={`Confirm delete ${what}`}
              onClick={() => {
                void onDelete().then((ok) => {
                  if (!ok) setMode("idle");
                });
              }}
              className="h-7 rounded-md border border-rose-600 bg-rose-600 px-2.5 text-white"
            >
              Delete
            </button>
          </div>
        </div>
      )}
      {revealed && (
        // Full width, every line, wrapped — a whole-file entry (e.g. a few
        // "PAM: url user/pass" lines) must read like the Files tab, not as one
        // truncated chip.
        <div
          data-testid="secret-value"
          className="col-span-full overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 py-1.5 font-mono text-xs"
        >
          {revealed.value.split(/\r?\n/).map((line, i) => (
            <div key={i} className="flex">
              <span className="w-9 flex-none select-none pr-3 text-right tabular-nums text-zinc-400">{i + 1}</span>
              <span className="min-w-0 whitespace-pre-wrap break-all pr-3 text-zinc-900 dark:text-zinc-100">{line}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function GroupHeading({ children, count }: { children: React.ReactNode; count: number }): React.JSX.Element {
  return (
    <h2 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
      {children}
      <span className="tabular-nums">{count}</span>
    </h2>
  );
}

export function SecretsView(): React.JSX.Element {
  const b = bridge();
  const [workspaces, setWorkspaces] = useState<WorkspaceFiles[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [groups, setGroups] = useState<Record<string, GroupState>>({});
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [pins, setPins] = useState<string[]>(readPins);
  const [query, setQuery] = useState("");
  const [revealed, setRevealed] = useState<Revealed>({});
  const [notice, setNotice] = useState<{ text: string; tone: "ok" | "error" } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  // Groups already asked for, so a re-render or a search keystroke never reads twice.
  const requested = useRef(new Set<string>());

  // Add a new credential. The workspace list is every workspace (GET /workspaces),
  // not only the ones that already have a sensitive_information/ folder — so a
  // fresh repo can take its first secret.
  const { workspaces: allWorkspaces } = useWorkspaces();
  const [addOpen, setAddOpen] = useState(false);
  const [addKind, setAddKind] = useState<"token" | "cookie">("token");
  const [addWs, setAddWs] = useState("");
  const [addName, setAddName] = useState("");
  const [addValue, setAddValue] = useState("");
  useEffect(() => {
    const first = allWorkspaces[0];
    if (addWs === "" && first) setAddWs(first.id);
  }, [addWs, allWorkspaces]);

  // `b` is window.choda, fixed for the page's lifetime.
  const load = useCallback(() => {
    if (!b) return;
    setLoadError(null);
    setWorkspaces(null);
    setGroups({});
    requested.current.clear();
    b.listSecretFiles()
      .then((r) => {
        if (r.ok && r.workspaces) setWorkspaces(r.workspaces);
        else setLoadError(r.reason ?? "could not list secrets");
      })
      .catch(() => setLoadError("could not list secrets"));
  }, []);

  useEffect(load, [load]);

  const loadGroup = useCallback((workspaceId: string) => {
    if (!b || requested.current.has(workspaceId)) return;
    requested.current.add(workspaceId);
    setGroups((prev) => ({ ...prev, [workspaceId]: "loading" }));
    b.listSecrets(workspaceId)
      .then((r) =>
        setGroups((prev) => ({
          ...prev,
          [workspaceId]: r.ok && r.entries ? r.entries : { error: r.reason ?? "could not load" },
        }))
      )
      .catch(() => setGroups((prev) => ({ ...prev, [workspaceId]: { error: "could not load" } })));
  }, []);

  const toggleGroup = (workspaceId: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(workspaceId)) next.delete(workspaceId);
      else next.add(workspaceId);
      return next;
    });
    loadGroup(workspaceId);
  };

  const q = query.trim().toLowerCase();

  // A search opens every group whose workspace or file names match, so load those.
  useEffect(() => {
    if (!q || !workspaces) return;
    for (const w of workspaces) {
      if (w.workspaceLabel.toLowerCase().includes(q) || w.files.some((f) => f.toLowerCase().includes(q))) {
        loadGroup(w.workspaceId);
      }
    }
  }, [q, workspaces, loadGroup]);

  // One ticker for every revealed value: count down, drop at zero.
  const anyRevealed = Object.keys(revealed).length > 0;
  useEffect(() => {
    if (!anyRevealed) return;
    const t = setInterval(() => {
      setRevealed((prev) => {
        const next: Revealed = {};
        for (const [id, r] of Object.entries(prev)) if (r.left > 1) next[id] = { ...r, left: r.left - 1 };
        return next;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [anyRevealed]);

  // "/" focuses search, like the rest of the app's lists.
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const togglePin = (id: string): void => {
    setPins((prev) => {
      const next = prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id];
      writePins(next);
      return next;
    });
  };

  const toggleReveal = (e: SecretEntry): void => {
    const id = secretId(e);
    if (revealed[id]) {
      setRevealed(({ [id]: _drop, ...rest }) => rest);
      return;
    }
    b?.revealSecret(e.workspaceId, e.file, e.key)
      .then((r) => {
        if (r.ok && typeof r.value === "string") {
          const value = r.value;
          setRevealed((prev) => ({ ...prev, [id]: { value, left: REVEAL_SECONDS } }));
        } else {
          setNotice({ text: `Could not show ${displayName(e)}: ${r.reason ?? "unknown error"}`, tone: "error" });
        }
      })
      .catch(() => setNotice({ text: `Could not show ${displayName(e)}`, tone: "error" }));
  };

  const copy = async (e: SecretEntry): Promise<boolean> => {
    const label = e.key ? `${displayName(e)} › ${e.key}` : displayName(e);
    try {
      const r = await b!.copySecret(e.workspaceId, e.file, e.key);
      if (!r.ok) {
        setNotice({ text: `Could not copy ${label}: ${r.reason ?? "unknown error"}`, tone: "error" });
        return false;
      }
      setNotice({
        text: `Copied ${label}${r.clearsInSeconds ? ` · clipboard clears in ${r.clearsInSeconds}s` : ""}`,
        tone: "ok",
      });
      return true;
    } catch {
      setNotice({ text: `Could not copy ${label}`, tone: "error" });
      return false;
    }
  };

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  // After a write, update local state in place — the new row shows at once, with
  // no listSecretFiles round-trip that would blank the screen.
  const applyWritten = (wsId: string, wsLabel: string, file: string): void => {
    setWorkspaces((prev) => {
      if (!prev) return prev;
      const existing = prev.find((w) => w.workspaceId === wsId);
      if (!existing) return [...prev, { workspaceId: wsId, workspaceLabel: wsLabel, files: [file] }];
      if (existing.files.includes(file)) return prev;
      return prev.map((w) =>
        w.workspaceId === wsId ? { ...w, files: [...w.files, file].sort() } : w
      );
    });
    setGroups((prev) => {
      const cur = prev[wsId];
      const entry: SecretEntry = { workspaceId: wsId, workspaceLabel: wsLabel, file, key: "" };
      if (!Array.isArray(cur)) {
        requested.current.add(wsId); // our insert is the source of truth; don't re-read over it
        return { ...prev, [wsId]: [entry] };
      }
      if (cur.some((e) => e.file === file && e.key === "")) return prev;
      return { ...prev, [wsId]: [...cur, entry] };
    });
    setExpanded((prev) => new Set(prev).add(wsId));
  };

  const saveNew = async (): Promise<void> => {
    if (!b) return;
    const base = addName.trim().replace(/\.(token|cookie)$/i, "");
    if (base === "" || addWs === "" || addValue.trim() === "") {
      setNotice({ text: "Pick a workspace, a name and paste a value.", tone: "error" });
      return;
    }
    const file = `${base}.${addKind}`;
    const wsLabel = allWorkspaces.find((w) => w.id === addWs)?.label ?? addWs;
    let r: { ok: boolean; reason?: string };
    try {
      r = await b.saveSecret(addWs, file, addKind, addValue);
    } catch {
      r = { ok: false, reason: "save failed" };
    }
    if (!r.ok) {
      setNotice({ text: `Could not save ${file}: ${r.reason ?? "unknown error"}`, tone: "error" });
      return;
    }
    applyWritten(addWs, wsLabel, file);
    setNotice({ text: `Saved ${file} to ${wsLabel}`, tone: "ok" });
    setAddValue("");
    setAddName("");
    setAddOpen(false);
  };

  const saveEdit = async (entry: SecretEntry, value: string): Promise<boolean> => {
    if (!b) return false;
    const kind = /\.cookie$/i.test(entry.file) ? "cookie" : "token";
    let r: { ok: boolean; reason?: string };
    try {
      r = await b.saveSecret(entry.workspaceId, entry.file, kind, value);
    } catch {
      r = { ok: false, reason: "save failed" };
    }
    if (!r.ok) {
      setNotice({ text: `Could not update ${displayName(entry)}: ${r.reason ?? "unknown error"}`, tone: "error" });
      return false;
    }
    setNotice({ text: `Updated ${displayName(entry)}`, tone: "ok" });
    return true;
  };

  const deleteEntry = async (entry: SecretEntry): Promise<boolean> => {
    if (!b) return false;
    let r: { ok: boolean; reason?: string };
    try {
      r = await b.deleteSecret(entry.workspaceId, entry.file);
    } catch {
      r = { ok: false, reason: "delete failed" };
    }
    if (!r.ok) {
      setNotice({ text: `Could not delete ${displayName(entry)}: ${r.reason ?? "unknown error"}`, tone: "error" });
      return false;
    }
    setGroups((prev) => {
      const cur = prev[entry.workspaceId];
      if (!Array.isArray(cur)) return prev;
      return { ...prev, [entry.workspaceId]: cur.filter((e) => e.file !== entry.file) };
    });
    setWorkspaces(
      (prev) =>
        prev &&
        prev.map((w) =>
          w.workspaceId === entry.workspaceId
            ? { ...w, files: w.files.filter((f) => f !== entry.file) }
            : w
        )
    );
    setPins((prev) => {
      const next = prev.filter((id) => !id.startsWith(`${entry.workspaceId}|${entry.file}|`));
      writePins(next);
      return next;
    });
    setNotice({ text: `Deleted ${displayName(entry)}`, tone: "ok" });
    return true;
  };

  const labels = new Map((workspaces ?? []).map((w) => [w.workspaceId, w.workspaceLabel]));
  const pinned = pins
    .map((id) => entryFromId(id, labels))
    .filter((e): e is SecretEntry => e !== null)
    // A pin whose file is gone from the listing is stale; hide it rather than
    // offer a Copy that can only fail.
    .filter(
      (e) =>
        workspaces === null ||
        workspaces.some((w) => w.workspaceId === e.workspaceId && w.files.includes(e.file))
    )
    .filter((e) => matches(e, q));

  function rowFor(e: SecretEntry, showWorkspace: boolean): React.JSX.Element {
    const id = secretId(e);
    return (
      <SecretRow
        key={id}
        entry={e}
        showWorkspace={showWorkspace}
        pinned={pins.includes(id)}
        revealed={revealed[id]}
        onTogglePin={() => togglePin(id)}
        onToggleReveal={() => toggleReveal(e)}
        onCopy={() => copy(e)}
        onSaveEdit={(value) => saveEdit(e, value)}
        onDelete={() => deleteEntry(e)}
      />
    );
  }

  function body(): React.JSX.Element {
    if (!b) {
      return (
        <EmptyState
          icon="ti-key"
          title="Secrets need the desktop app"
          description="The browser shell cannot read files on this machine. Open Choda Companion to copy or view a secret."
        />
      );
    }
    if (loadError) return <ErrorState variant="failed" subject="secrets" description={loadError} />;
    if (workspaces === null) return <Skeleton shape="list" label="Loading secrets…" />;
    if (workspaces.length === 0) {
      return (
        <EmptyState
          icon="ti-key"
          title="No secrets found"
          description="No workspace has files in its sensitive_information/ folder."
        />
      );
    }
    let shownGroups = 0;
    return (
      <div className="flex-1 min-h-0 overflow-y-auto space-y-4">
        <section aria-label="Pinned secrets">
          <GroupHeading count={pinned.length}>
            <i className="ti ti-pinned-filled text-amber-600 dark:text-amber-400" aria-hidden="true" />
            Pinned
          </GroupHeading>
          <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
            {pinned.length > 0 ? (
              pinned.map((e) => rowFor(e, true))
            ) : (
              <p className="px-3 py-3 text-center text-xs text-zinc-400">
                {q ? "No pinned secret matches." : "Pin the ones you use often and they stay up here."}
              </p>
            )}
          </div>
        </section>
        <div className="space-y-1">
          {workspaces.map((w) => {
            const state = groups[w.workspaceId];
            const entries = Array.isArray(state) ? state : null;
            const nameHit =
              !q ||
              w.workspaceLabel.toLowerCase().includes(q) ||
              w.files.some((f) => f.toLowerCase().includes(q));
            const keyHit = !!q && entries !== null && entries.some((e) => matches(e, q));
            if (!nameHit && !keyHit) return null;
            shownGroups++;
            const open = q ? true : expanded.has(w.workspaceId);
            const items = entries?.filter((e) => !pins.includes(secretId(e)) && matches(e, q)) ?? [];
            return (
              <section key={w.workspaceId} aria-label={`${w.workspaceLabel} secrets`}>
                <button
                  type="button"
                  aria-expanded={open}
                  disabled={!!q}
                  onClick={() => toggleGroup(w.workspaceId)}
                  className="flex w-full items-center gap-1.5 rounded-md px-1 py-1.5 text-left text-[11px] font-medium uppercase tracking-wide text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900 disabled:hover:bg-transparent dark:text-zinc-400 dark:hover:bg-zinc-800/50 dark:hover:text-zinc-100"
                >
                  <i
                    className={`ti ti-chevron-down text-zinc-400 transition-transform ${open ? "" : "-rotate-90"}`}
                    aria-hidden="true"
                  />
                  {w.workspaceLabel}
                  <span className="font-normal normal-case tracking-normal tabular-nums text-zinc-400">
                    {w.files.length} {w.files.length === 1 ? "file" : "files"}
                    {entries ? ` · ${entries.length} entries` : ""}
                  </span>
                </button>
                {open && (
                  <div className="mt-1 mb-3 border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
                    {state === undefined || state === "loading" ? (
                      <p className="px-3 py-3 text-xs text-zinc-400">Loading…</p>
                    ) : !entries ? (
                      <p className="px-3 py-3 text-xs text-amber-700 dark:text-amber-400">
                        Could not load: {(state as { error: string }).error}
                      </p>
                    ) : items.length > 0 ? (
                      items.map((e) => rowFor(e, false))
                    ) : (
                      <p className="px-3 py-3 text-center text-xs text-zinc-400">
                        {q ? "No entry here matches." : entries.length > 0 ? "Everything here is pinned." : "These files have no filled values."}
                      </p>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
        {q && shownGroups === 0 && pinned.length === 0 && (
          <p className="text-center text-xs text-zinc-400">Nothing matches “{query.trim()}”.</p>
        )}
      </div>
    );
  }

  return (
    <section aria-label="secrets" className="flex-1 min-h-0 flex flex-col">
      <div className="flex items-baseline gap-2 mb-4 flex-wrap">
        <h1 className="text-lg font-medium">Secrets</h1>
        <span className="text-xs text-zinc-400">
          from each workspace’s <code className="font-mono">sensitive_information/</code> · hidden until you show one
        </span>
      </div>
      {b && workspaces !== null && workspaces.length > 0 && (
        <div className="flex gap-2 mb-4">
          <label className="flex-1 flex items-center gap-2 h-8 px-2.5 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 focus-within:border-blue-500">
            <i className="ti ti-search text-zinc-400" aria-hidden="true" />
            <input
              ref={searchRef}
              id="secrets-search"
              type="search"
              aria-label="Find a secret"
              placeholder="Find a secret: keycloak, sync, azure…"
              autoComplete="off"
              value={query}
              onChange={(ev) => setQuery(ev.target.value)}
              className="w-full bg-transparent outline-none text-sm"
            />
            <kbd className="font-mono text-[10.5px] text-zinc-400 border border-zinc-200 dark:border-zinc-700 rounded px-1">/</kbd>
          </label>
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-zinc-200 dark:border-zinc-700 text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            <i className="ti ti-refresh" aria-hidden="true" />
            Reload
          </button>
        </div>
      )}
      {b && (
        <div className="mb-4 rounded-lg border border-zinc-200 dark:border-zinc-800">
          <button
            type="button"
            aria-expanded={addOpen}
            onClick={() => setAddOpen((o) => !o)}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-sm font-medium"
          >
            <i className="ti ti-plus text-blue-600 dark:text-blue-400" aria-hidden="true" />
            Add a token or cookie
            <i
              className={`ti ti-chevron-down ml-auto text-zinc-400 transition-transform ${addOpen ? "" : "-rotate-90"}`}
              aria-hidden="true"
            />
          </button>
          {addOpen && (
            <div className="flex flex-col gap-3 border-t border-zinc-200 dark:border-zinc-800 px-3 py-3">
              <div role="group" aria-label="Type" className="inline-flex w-max overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-700">
                {(["token", "cookie"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={addKind === k}
                    onClick={() => setAddKind(k)}
                    className={[
                      "px-3 py-1.5 text-sm capitalize",
                      addKind === k
                        ? "bg-blue-600 text-white"
                        : "bg-white dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400",
                    ].join(" ")}
                  >
                    {k}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <label className="flex flex-col gap-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                  Workspace
                  <select
                    aria-label="Workspace"
                    value={addWs}
                    onChange={(ev) => setAddWs(ev.target.value)}
                    className="h-8 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 text-sm text-zinc-900 dark:text-zinc-100"
                  >
                    {allWorkspaces.length === 0 && <option value="">No workspaces</option>}
                    {allWorkspaces.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.label} ({w.projectId})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-1 flex-col gap-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                  Name
                  <input
                    aria-label="Name"
                    value={addName}
                    spellCheck={false}
                    placeholder="test-api"
                    onChange={(ev) => setAddName(ev.target.value)}
                    className="h-8 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 text-sm"
                  />
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-zinc-400">
                <span className="rounded bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5">
                  sent as{" "}
                  <span className="text-zinc-700 dark:text-zinc-200">
                    {addKind === "cookie" ? "Cookie: …" : "Authorization: Bearer …"}
                  </span>
                </span>
                <span className="break-all">
                  {(allWorkspaces.find((w) => w.id === addWs)?.label ?? (addWs || "…"))}
                  /sensitive_information/
                  {(addName.trim().replace(/\.(token|cookie)$/i, "") || "…")}.{addKind}
                </span>
              </div>
              <textarea
                aria-label="Value"
                value={addValue}
                spellCheck={false}
                onChange={(ev) => setAddValue(ev.target.value)}
                placeholder={
                  addKind === "cookie"
                    ? "paste the whole Cookie: value from DevTools"
                    : "paste the access token"
                }
                className="min-h-[72px] w-full resize-y rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 p-2 font-mono text-xs"
              />
              <p className="flex items-start gap-2 rounded-md bg-zinc-50 dark:bg-zinc-800/50 px-2.5 py-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                <i className="ti ti-shield-lock mt-0.5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                Written to the gitignored file on disk only — never the synced database, never off this machine.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAddOpen(false)}
                  className="h-8 rounded-md border border-zinc-200 dark:border-zinc-700 px-3 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void saveNew()}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-blue-600 bg-blue-600 px-3 text-sm text-white"
                >
                  <i className="ti ti-check" aria-hidden="true" />
                  Save
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {body()}
      {notice && (
        <div
          role="status"
          data-testid="secrets-notice"
          className={[
            "mt-3 self-center inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs",
            notice.tone === "ok"
              ? "bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900"
              : "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
          ].join(" ")}
        >
          <i className={`ti ${notice.tone === "ok" ? "ti-check" : "ti-alert-triangle"}`} aria-hidden="true" />
          {notice.text}
        </div>
      )}
    </section>
  );
}
