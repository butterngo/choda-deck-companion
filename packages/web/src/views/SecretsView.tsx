// Quick access to the credentials each workspace keeps in `sensitive_information/`.
//
// Getting one used to mean Explorer → project → folder → file → select. Here the
// list is names only (workspace, file, key) from the main process; Copy puts the
// value on the clipboard without it ever reaching this page, and the eye icon
// fetches one value on demand, shows it for REVEAL_SECONDS and drops it.
//
// Pins are a per-machine convenience, so they live in localStorage.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EmptyState } from "../components/state/EmptyState";
import { ErrorState } from "../components/state/ErrorState";
import { Skeleton } from "../components/state/Skeleton";

export interface SecretEntry {
  workspaceId: string;
  workspaceLabel: string;
  file: string;
  /** "" for a single-value file. */
  key: string;
}

interface SecretsBridge {
  listSecrets: () => Promise<{ ok: boolean; reason?: string; entries?: SecretEntry[] }>;
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
}

/** The packaged app's bridge; absent in the browser shell. */
function bridge(): SecretsBridge | null {
  const w = window as unknown as { choda?: Partial<SecretsBridge> };
  const c = w.choda;
  return typeof c?.listSecrets === "function" &&
    typeof c.copySecret === "function" &&
    typeof c.revealSecret === "function"
    ? (c as SecretsBridge)
    : null;
}

const PIN_KEY = "choda.secrets.pins";
const REVEAL_SECONDS = 10;

export function secretId(e: SecretEntry): string {
  return `${e.workspaceId}|${e.file}|${e.key}`;
}

function displayName(e: SecretEntry): string {
  return e.file.replace(/\.txt$/i, "");
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

function SecretRow({
  entry,
  showWorkspace,
  pinned,
  revealed,
  onTogglePin,
  onToggleReveal,
  onCopy,
}: {
  entry: SecretEntry;
  showWorkspace: boolean;
  pinned: boolean;
  revealed?: { value: string; left: number };
  onTogglePin: () => void;
  onToggleReveal: () => void;
  onCopy: () => Promise<boolean>;
}): React.JSX.Element {
  const [copied, setCopied] = useState(false);
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
        <span
          data-testid="secret-value"
          className="font-mono text-xs max-w-[280px] truncate select-all px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
        >
          {revealed.value}
          <span className="ml-1.5 select-none text-[10.5px] text-zinc-400">{revealed.left}s</span>
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
      </div>
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
  const [entries, setEntries] = useState<SecretEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pins, setPins] = useState<string[]>(readPins);
  const [query, setQuery] = useState("");
  const [revealed, setRevealed] = useState<Revealed>({});
  const [notice, setNotice] = useState<{ text: string; tone: "ok" | "error" } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    if (!b) return;
    setLoadError(null);
    b.listSecrets()
      .then((r) => {
        if (r.ok && r.entries) setEntries(r.entries);
        else setLoadError(r.reason ?? "could not list secrets");
      })
      .catch(() => setLoadError("could not list secrets"));
    // `b` is window.choda, fixed for the page's lifetime.
  }, []);

  useEffect(load, [load]);

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

  const q = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      (entries ?? []).filter(
        (e) => !q || `${e.workspaceLabel} ${e.file} ${e.key}`.toLowerCase().includes(q)
      ),
    [entries, q]
  );
  const pinned = pins
    .map((id) => visible.find((e) => secretId(e) === id))
    .filter((e): e is SecretEntry => e !== undefined);
  const groups = useMemo(() => {
    const byWs = new Map<string, SecretEntry[]>();
    for (const e of visible) {
      if (pins.includes(secretId(e))) continue;
      const list = byWs.get(e.workspaceLabel) ?? [];
      list.push(e);
      byWs.set(e.workspaceLabel, list);
    }
    return [...byWs.entries()];
  }, [visible, pins]);

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
    if (entries === null) return <Skeleton shape="list" label="Loading secrets…" />;
    if (entries.length === 0) {
      return (
        <EmptyState
          icon="ti-key"
          title="No secrets found"
          description="No workspace has filled files in its sensitive_information/ folder."
        />
      );
    }
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
        {groups.map(([ws, list]) => (
          <section key={ws} aria-label={`${ws} secrets`}>
            <GroupHeading count={list.length}>{ws}</GroupHeading>
            <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
              {list.map((e) => rowFor(e, false))}
            </div>
          </section>
        ))}
        {q && visible.length === 0 && (
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
      {b && entries !== null && entries.length > 0 && (
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
