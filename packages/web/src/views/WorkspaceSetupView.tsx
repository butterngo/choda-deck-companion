// TASK-1830 — the Setup tab: what is actually configured for this workspace.
//
// Butter's problem, in their words: "i don't know many skill, mcp global and
// local(pre-project) sometime i want to review and editable but impossiable".
//
// Three things about the shape, each decided rather than defaulted:
//
// 1. NO NEW SIDEBAR ENTRY. This is a fourth tab inside WorkspaceView, which
//    also makes it project-scoped by construction rather than by a filter — a
//    tab inside a workspace cannot show another workspace's config.
//
// 2. EVERY ROW NAMES ITS ORIGIN. Global / This project / Plugin. The scope of a
//    row is the one thing a reader cannot infer from its name, and not knowing
//    it is the whole reason the inventory is confusing today.
//
// 3. OPENING A FILE IS PATH + COPY. Decided deliberately: the renderer has no
//    bridge to the Electron main process (contextIsolation: true,
//    nodeIntegration: false, no preload anywhere in electron/). Adding the
//    app's first preload, or letting the adapter launch an editor, are both
//    larger steps than the file write already ruled out of this feature. The
//    companion writes nothing to disk anywhere in this flow.
//
// Layout follows WorkspaceDocsView, which is also the shape TASK-1786 had to
// repair: the pane is a non-scrolling column, header flex-none, body
// min-h-0 flex-1 overflow-y-auto. See the gotcha
// "a-detail-pane-must-not-be-the-scrolling-element".

import { useEffect, useState } from "react";
import { useClaudeConfig } from "../hooks/use-claude-config";
import { CapabilityNote } from "../components/state/CapabilityNote";
import { EmptyState } from "../components/state/EmptyState";
import { ErrorState } from "../components/state/ErrorState";
import { Skeleton } from "../components/state/Skeleton";
import { CaptureMarkdown } from "../components/CaptureMarkdown";
import { SourceView } from "../components/SourceView";
import { useClaudeConfigFile } from "../hooks/use-claude-config-file";
import { isMarkdown } from "./WorkspaceDocsView";
import {
  ConfigChangedOnDiskError,
  ConfigSaveRefusedError,
  ReviewFailedError,
  ReviewUnavailableError,
  fetchReviewModels,
  reviewClaudeConfig,
  sweepClaudeConfig,
  saveClaudeConfigFile,
  validateClaudeConfig,
} from "../api";
import type {
  ClaudeConfigResult,
  ClaudeRef,
  ConfigFinding,
  ConfigSweepEntry,
  McpServer,
  ReviewModel,
  ReviewNote,
} from "../api";

type Origin = "Global" | "This project" | "Plugin";

interface Row {
  key: string;
  name: string;
  origin: Origin;
  path: string;
  detail: string | null;
  /** Only MCP rows carry one. */
  server: McpServer | null;
  /**
   * How to fetch this row's file. Null for an MCP server: its `source` is
   * .claude.json or a repo .mcp.json, and neither is served as a file — the
   * first deliberately so, since MCP is a minority of a 123KB document that
   * also holds userID and trust state.
   */
  ref: ClaudeRef | null;
}

interface Group {
  id: string;
  label: string;
  rows: Row[];
  /**
   * Why the group is empty, when it is. An empty group still renders: a section
   * that vanishes is indistinguishable from one that was never built, and on
   * Butter's machine the commands root is a DANGLING symlink, so empty is the
   * correct answer rather than a defect.
   */
  emptyReason: string;
}

function buildGroups(config: ClaudeConfigResult): Group[] {
  const skills: Row[] = config.skills.map((s) => ({
    key: `skill:${s.scope}:${s.name}`,
    name: s.name,
    origin: s.scope === "plugin" ? "Plugin" : "Global",
    path: s.path,
    detail: s.description.length > 0 ? s.description : null,
    server: null,
    ref: s.ref,
  }));

  const servers: Row[] = config.mcpServers.map((m) => ({
    key: `mcp:${m.origin}:${m.name}`,
    name: m.name,
    origin: m.origin === "project" ? "This project" : "Global",
    path: m.source,
    detail: m.error !== null ? m.error : m.transport,
    server: m,
    ref: null,
  }));

  const commands: Row[] = config.commands.map((c) => ({
    key: `cmd:${c.name}`,
    name: c.name,
    origin: "Global",
    path: c.path,
    detail: null,
    server: null,
    ref: c.ref,
  }));

  const rules: Row[] = config.rules.map((r) => ({
    key: `rule:${r.name}`,
    name: r.name,
    origin: "Global",
    path: r.path,
    detail: null,
    server: null,
    ref: r.ref,
  }));

  return [
    { id: "skills", label: "Skills", rows: skills, emptyReason: "No skills are installed." },
    {
      id: "mcp",
      label: "MCP servers",
      rows: servers,
      emptyReason: "No servers are configured on this machine.",
    },
    {
      id: "commands",
      label: "Slash commands",
      rows: commands,
      emptyReason:
        "Nothing here — the commands folder is missing or points somewhere that no longer exists.",
    },
    {
      id: "rules",
      label: "Rules and settings",
      rows: rules,
      emptyReason: "No global CLAUDE.md on this machine.",
    },
  ];
}

function StatusChip({ server }: { server: McpServer }): React.JSX.Element {
  if (server.error !== null) {
    return (
      <span
        data-testid={`mcp-status-${server.name}`}
        data-status="unreadable"
        className="rounded border border-dashed border-amber-400 dark:border-amber-700 px-1.5 py-px text-[10.5px] text-amber-700 dark:text-amber-400"
      >
        Unreadable
      </span>
    );
  }
  // Three states, because the machine has three. A pending server has neither
  // been approved nor rejected, and calling it on or off would be a guess.
  const label =
    server.status === "active" ? "On" : server.status === "disabled" ? "Off" : "Pending";
  const tone =
    server.status === "active"
      ? "border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-400"
      : "border-zinc-200 dark:border-zinc-800 border-dashed text-zinc-400";
  return (
    <span
      data-testid={`mcp-status-${server.name}`}
      data-status={server.status}
      className={`rounded border px-1.5 py-px text-[10.5px] ${tone}`}
    >
      {label}
    </span>
  );
}

export function WorkspaceSetupView({ workspaceId }: { workspaceId: string }): React.JSX.Element {
  const { config, isLoading, isError, outdatedAdapter, unknownWorkspace } =
    useClaudeConfig(workspaceId);
  const [selected, setSelected] = useState<Row | null>(null);
  const [copied, setCopied] = useState(false);
  // Called unconditionally and before every early return below — a hook behind
  // a branch is a hook that changes order between renders.
  const file = useClaudeConfigFile(selected?.ref ?? null);
  // TASK-1844 — the editor. `draft` is null when not editing, so "no unsaved
  // changes" and "an empty file" stay distinguishable.
  const [draft, setDraft] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const [findings, setFindings] = useState<ConfigFinding[] | null>(null);
  const [busy, setBusy] = useState(false);
  // TASK-1845 — review state. Separate from `findings` because a note is an
  // opinion and a finding is a fact, and the two must not share a container.
  const [notes, setNotes] = useState<ReviewNote[] | null>(null);
  const [reviewUnavailable, setReviewUnavailable] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  // TASK-1856 — the deployments this resource actually has. Loaded once, and
  // separately from review, because listing costs nothing and reviewing costs
  // money; tying them together would make opening the pane a purchase.
  const [models, setModels] = useState<ReviewModel[] | null>(null);
  const [modelsUnavailable, setModelsUnavailable] = useState(false);
  const [picked, setPicked] = useState<string>("");
  // TASK-1859 — the whole inventory's verdict, fetched once on open. Keyed by
  // "rootId/rel" so a row can look itself up without scanning.
  const [sweep, setSweep] = useState<Map<string, ConfigSweepEntry> | null>(null);
  const [sweepFailed, setSweepFailed] = useState(false);
  const [filter, setFilter] = useState("");

  // Same rule as the models effect below, and it is not a style preference:
  // hooks must run on EVERY render. Placing one after the isLoading early
  // return shipped a crash in 0.9.7 (React #310) that took out the whole tab.
  useEffect(() => {
    const ac = new AbortController();
    sweepClaudeConfig(ac.signal)
      .then((entries) => {
        setSweep(new Map(entries.map((e) => [`${e.ref.rootId}/${e.ref.rel}`, e])));
      })
      .catch(() => {
        // The list still works without a verdict; saying so beats a silent zero,
        // which would read as "everything is fine".
        if (!ac.signal.aborted) setSweepFailed(true);
      });
    return () => {
      ac.abort();
    };
  }, []);

  // MUST stay above the early returns below. Placed next to runReview at first,
  // which put it after `isLoading` returns a skeleton: the first render ran
  // fewer hooks than the second, and React tore the whole view down with error
  // #310. Hooks run on every render or they run wrong.
  //
  // Deliberately NOT in the row-selection handler either: the list belongs to
  // the workspace's configured provider, not to a file, so re-fetching it per
  // row would be work nobody asked for.
  useEffect(() => {
    const ac = new AbortController();
    fetchReviewModels(ac.signal)
      .then((list) => {
        setModels(list.models);
        setPicked((current) => (current === "" ? list.selected : current));
      })
      .catch(() => {
        // A listing outage must not disable review — the adapter still has a
        // configured default. Saying the list is unavailable is the whole
        // response; hiding the button would make a convenience load-bearing.
        if (!ac.signal.aborted) setModelsUnavailable(true);
      });
    return () => {
      ac.abort();
    };
  }, []);


  if (outdatedAdapter) {
    return (
      <CapabilityNote icon="ti-refresh-alert">
        <span data-testid="setup-outdated-adapter">
          <span className="font-medium text-zinc-900 dark:text-zinc-100">
            This app is behind its adapter.
          </span>{" "}
          The installed build carries an older bundle that has no configuration route yet. Updating
          the app will bring it in.
        </span>
      </CapabilityNote>
    );
  }
  if (unknownWorkspace) {
    return <ErrorState variant="failed" subject={workspaceId} description="No workspace is registered under this id." />;
  }
  if (isError) return <ErrorState variant="failed" subject="the configuration" />;
  if (isLoading || config === null) return <Skeleton shape="list" label="Reading configuration…" />;

  const groups = buildGroups(config);
  const total = groups.reduce((n, g) => n + g.rows.length, 0);

  if (total === 0) {
    return (
      <EmptyState
        icon="ti-settings"
        title="Nothing is configured"
        description="No skills, servers, commands or rules were found for this workspace."
      />
    );
  }

  async function runValidate(ref: ClaudeRef, text?: string): Promise<void> {
    try {
      setFindings(await validateClaudeConfig(ref, text));
    } catch {
      // Validation is an aid, not a gate. A failed check must not make the file
      // unreadable or the save unavailable.
      setFindings(null);
    }
  }

  /**
   * Called from ONE place: the Review button's onClick. Not from an effect, not
   * from save, not from selection. The adapter makes the boundary structural
   * (TASK-1843 AC-5); this is the half the UI is responsible for.
   */
  async function runReview(ref: ClaudeRef, text?: string): Promise<void> {
    setReviewing(true);
    setReviewError(null);
    setReviewUnavailable(false);
    try {
      // An empty pick means "whatever the adapter is configured with", which is
      // not the same as a model named "" — hence undefined, not the raw value.
      setNotes(await reviewClaudeConfig(ref, text, undefined, picked === "" ? undefined : picked));
    } catch (err) {
      setNotes(null);
      if (err instanceof ReviewUnavailableError) {
        // Not an error state. On most machines no model is configured, and
        // painting that rose would train the eye to ignore the real failures.
        setReviewUnavailable(true);
      } else if (err instanceof ReviewFailedError) {
        setReviewError(
          err.kind === "rate_limit"
            ? "The model is rate limited right now. Wait a moment and ask again."
            : err.kind === "network"
              ? "Could not reach the model — check the network rather than the key."
              : err.kind === "auth"
                ? "The configured key was rejected."
                : err.kind === "parse"
                  ? "The model answered in a shape this app could not read."
                  : `The model call failed (${err.kind}).`,
        );
      } else {
        setReviewError("The model call failed.");
      }
    } finally {
      setReviewing(false);
    }
  }

  async function save(row: Row, text: string): Promise<void> {
    if (row.ref === null) return;
    setBusy(true);
    setSaveError(null);
    setConflict(null);
    try {
      // if-match carries the hash the READ returned. Anything else turns the
      // adapter's precondition into decoration.
      await saveClaudeConfigFile(row.ref, text, file.sha256);
      setDraft(null);
      await runValidate(row.ref);
    } catch (err) {
      if (err instanceof ConfigChangedOnDiskError) {
        // The draft is deliberately kept. Discarding it here would lose the
        // reader's work to a race they did not cause, and re-sending would
        // overwrite whoever got there first.
        setConflict(
          "This file changed on disk since you opened it. Your edit is still here — copy it out, reopen the file, and re-apply.",
        );
      } else if (err instanceof ConfigSaveRefusedError) {
        setSaveError(
          err.status === 413
            ? "That file is too large to save through the companion."
            : err.status === 403
              ? "This path is outside what the companion is allowed to write."
              : err.message,
        );
      } else {
        setSaveError(err instanceof Error ? err.message : "the save failed");
      }
    } finally {
      setBusy(false);
    }
  }

  async function copyPath(path: string): Promise<void> {
    try {
      await navigator.clipboard?.writeText(path);
      setCopied(true);
    } catch {
      // A refused clipboard is not worth an error state — the path is on screen
      // and can be selected by hand, which is the fallback either way.
      setCopied(false);
    }
  }

  // A row's verdict, or null while the sweep is still out. Null and "clean" are
  // deliberately different: an unchecked row must not render as a passing one.
  const verdictFor = (row: Row): ConfigSweepEntry | null => {
    if (sweep === null || row.ref === null) return null;
    return sweep.get(`${row.ref.rootId}/${row.ref.rel}`) ?? null;
  };

  const worstOf = (e: ConfigSweepEntry | null): "error" | "warning" | null => {
    if (e === null || e.findings.length === 0) return null;
    return e.findings.some((f) => f.severity === "error") ? "error" : "warning";
  };

  const sweptRows = groups.flatMap((g) => g.rows).filter((r) => r.ref !== null);
  const needAttention = sweptRows.filter((r) => worstOf(verdictFor(r)) !== null).length;
  const checkedCount = sweep === null ? 0 : sweptRows.filter((r) => verdictFor(r) !== null).length;

  // The rows a reader can currently see, in render order. The keyboard walks
  // THIS list, not the unfiltered one — moving to a row that is hidden would
  // select something invisible.
  const visibleRows = (): Row[] => groups.flatMap((g) => g.rows).filter(matchesFilter);

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>): void {
    const target = e.target as HTMLElement;
    const typing =
      target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT";

    if (e.key === "/" && !typing) {
      e.preventDefault();
      (document.querySelector('[data-testid="setup-filter"]') as HTMLInputElement | null)?.focus();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    // Arrows inside a textarea belong to the textarea.
    if (target.tagName === "TEXTAREA") return;

    const rows = visibleRows();
    if (rows.length === 0) return;
    e.preventDefault();
    const at = rows.findIndex((r) => r.key === selected?.key);
    const next =
      e.key === "ArrowDown"
        ? Math.min(at + 1, rows.length - 1)
        : Math.max(at - 1, 0);
    const row = rows[at === -1 ? 0 : next];
    if (row !== undefined) openRow(row);
  }

  // One place, so a row opened by the keyboard resets exactly what a row
  // opened by the mouse resets. Two copies of this drift, and the drift is
  // invisible: a stale draft offered against the wrong file.
  function openRow(row: Row): void {
    setSelected(row);
    setCopied(false);
    // Everything below belongs to the row that was open.
    // Carrying a draft across rows would offer to save one
    // file's text into another.
    setDraft(null);
    setSaveError(null);
    setConflict(null);
    setFindings(null);
    // Cleared, never re-requested. Selecting a row must not
    // spend money — that is the whole cost boundary.
    setNotes(null);
    setReviewUnavailable(false);
    setReviewError(null);
  }

  const matchesFilter = (row: Row): boolean => {
    const q = filter.trim().toLowerCase();
    if (q === "") return true;
    return row.name.toLowerCase().includes(q) || row.path.toLowerCase().includes(q);
  };

  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-3"
      onKeyDown={onKeyDown}
      data-testid="setup-root"
    >
      {/* The verdict, stated rather than left to be discovered. */}
      <div
        data-testid="setup-verdict"
        className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-zinc-200 dark:border-zinc-800 pb-2.5"
      >
        {sweep === null && !sweepFailed && (
          <span data-testid="setup-verdict-running" className="text-[11.5px] text-zinc-500">
            Checking {sweptRows.length} items…
          </span>
        )}
        {sweepFailed && (
          <span data-testid="setup-verdict-failed" className="text-[11.5px] text-zinc-500">
            Could not check this workspace — the list below is still accurate.
          </span>
        )}
        {sweep !== null && (
          <>
            <span data-testid="setup-verdict-checked" className="text-[11.5px] tabular-nums text-zinc-500">
              <span className="font-medium text-zinc-900 dark:text-zinc-100">{checkedCount}</span> items
              checked
            </span>
            <span
              data-testid="setup-verdict-attention"
              className={[
                "text-[11.5px] tabular-nums",
                needAttention > 0 ? "text-red-700 dark:text-red-400" : "text-zinc-500",
              ].join(" ")}
            >
              <span className="font-medium">{needAttention}</span>{" "}
              {needAttention === 1 ? "needs" : "need"} attention
            </span>
          </>
        )}
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by name or path"
          aria-label="Filter"
          data-testid="setup-filter"
          className="ml-auto w-52 rounded-md border border-zinc-200 dark:border-zinc-800 bg-transparent px-2 py-1 text-[11.5px] text-zinc-700 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
        />
      </div>

    <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(320px,440px)_1fr] lg:grid-rows-[minmax(0,1fr)]">
      <div data-testid="setup-list-pane" className="min-h-0 overflow-y-auto">
        {groups.map((group) => (
          <section key={group.id} data-testid={`setup-group-${group.id}`} className="mb-4">
            <div className="mb-1.5 flex items-baseline gap-2 px-1">
              <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
                {group.label}
              </span>
              <span className="text-[11px] tabular-nums text-zinc-400">{group.rows.length}</span>
            </div>

            {group.rows.length === 0 ? (
              <p
                data-testid={`setup-group-empty-${group.id}`}
                className="px-1 py-1.5 text-[11.5px] text-zinc-500"
              >
                {group.emptyReason}
              </p>
            ) : (
              <ul className="space-y-0.5">
                {group.rows.filter(matchesFilter).map((row) => (
                  <li key={row.key}>
                    <button
                      type="button"
                      onClick={() => openRow(row)}
                      aria-current={selected?.key === row.key ? "true" : undefined}
                      data-testid={`setup-row-${row.key}`}
                      className={[
                        "flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-left",
                        selected?.key === row.key
                          ? "border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50"
                          : "border-transparent hover:bg-zinc-50 dark:hover:bg-zinc-800/50",
                      ].join(" ")}
                    >
                      {/* TASK-1859 — the verdict lives in the row, so one scan
                          top to bottom finds the work. A row the sweep has not
                          answered for yet renders NOTHING here, because an
                          unchecked row must not look like a passing one. */}
                      {(() => {
                        const worst = worstOf(verdictFor(row));
                        if (worst === null) return null;
                        return (
                          <span
                            data-testid={`setup-sev-${row.key}`}
                            data-severity={worst}
                            aria-hidden="true"
                            className={[
                              "h-1.5 w-1.5 flex-none rounded-full",
                              worst === "error" ? "bg-red-600 dark:bg-red-400" : "bg-amber-600 dark:bg-amber-400",
                            ].join(" ")}
                          />
                        );
                      })()}
                      <span className="min-w-0 flex-1 truncate text-[13.5px]">{row.name}</span>
                      {(() => {
                        const entry = verdictFor(row);
                        const first = entry?.findings[0];
                        if (first === undefined) return null;
                        return (
                          <span
                            data-testid={`setup-sev-reason-${row.key}`}
                            className="flex-none truncate text-[10.5px] text-zinc-500"
                          >
                            {first.message}
                          </span>
                        );
                      })()}
                      {row.server !== null && <StatusChip server={row.server} />}
                      <span
                        data-testid={`setup-origin-${row.key}`}
                        className="flex-none rounded-full border border-zinc-200 dark:border-zinc-800 px-1.5 py-px text-[10.5px] text-zinc-500"
                      >
                        {row.origin}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}

        {/* The count is only honest with its boundary attached. Ten of the
            sixteen servers `claude mcp list` reports are claude.ai connectors
            configured account-side, and no amount of reading disk will find
            them — so the tab says so rather than presenting six as the truth. */}
        {config.mcpScope.localOnly && (
          <p data-testid="setup-mcp-scope" className="px-1 pb-2 text-[11px] text-zinc-500">
            {config.mcpScope.note}
          </p>
        )}
      </div>

      <div
        data-testid="setup-detail-pane"
        className="flex min-h-0 flex-col overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800 p-3"
      >
        {selected === null ? (
          <p data-testid="setup-detail-idle" className="px-1 py-6 text-center text-xs text-zinc-500">
            Pick anything on the left to see where it lives.
          </p>
        ) : (
          <>
            <div className="flex flex-none items-baseline gap-2">
              <h3 className="text-sm font-medium">{selected.name}</h3>
              <span className="text-[11px] text-zinc-400">{selected.origin}</span>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {selected.detail !== null && (
                <p className="mt-2 text-[12.5px] leading-relaxed text-zinc-600 dark:text-zinc-300">
                  {selected.detail}
                </p>
              )}

              <p className="mt-3 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
                Path
              </p>
              <div className="mt-1 flex items-start gap-2">
                <code
                  data-testid="setup-detail-path"
                  className="min-w-0 flex-1 break-all rounded bg-zinc-50 dark:bg-zinc-900 px-2 py-1.5 font-mono text-[11.5px]"
                >
                  {selected.path}
                </code>
                <button
                  type="button"
                  onClick={() => void copyPath(selected.path)}
                  data-testid="setup-copy-path"
                  className="flex-none rounded-md border border-zinc-200 dark:border-zinc-800 px-2 py-1 text-[11.5px] text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                >
                  {copied ? "Copied" : "Copy path"}
                </button>
              </div>

              {/* Said plainly, because the alternative was considered and
                  rejected rather than forgotten. */}
              <p data-testid="setup-open-note" className="mt-2 text-[11px] text-zinc-500">
                Open it in your own editor — the companion only reads.
              </p>

              {/* TASK-1831 — the file itself, which this pane shipped without.
                  Read-only was the right call; showing nothing to read was not.

                  Rendered the same way WorkspaceDocsView renders a doc: prose
                  through CaptureMarkdown, anything else through SourceView.
                  Running source through the markdown renderer would eat leading
                  hashes and underscores — quietly corrupting the file it claims
                  to show. */}
              {/* TASK-1844 — findings sit BESIDE the text, not in a modal: they
                  are read while editing, and a dialog that must be dismissed to
                  see the line it names is worse than no dialog. */}
              {findings !== null && (
                <div data-testid="setup-findings" className="mt-3">
                  {findings.length === 0 ? (
                    <p
                      data-testid="setup-findings-clean"
                      className="text-[11.5px] text-green-700 dark:text-green-400"
                    >
                      Checked — nothing to report.
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {findings.map((f, i) => (
                        <li
                          key={`${f.checkId}-${i}`}
                          data-testid={`setup-finding-${f.checkId}`}
                          data-severity={f.severity}
                          className="rounded border border-zinc-200 dark:border-zinc-800 px-2 py-1 text-[11.5px]"
                        >
                          <span className="font-medium">{f.severity}</span> · {f.message}
                          {f.line !== null && <span className="text-zinc-400"> (line {f.line})</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Deliberately its own block, labelled, and never merged into the
                  findings list above. A finding is a fact about the file; a note
                  is a judgement that can be wrong, and rendering them alike lets
                  a wrong judgement inherit a check's authority. */}
              {reviewUnavailable && (
                <div className="mt-3">
                  <CapabilityNote icon="ti-sparkles">
                    <span data-testid="setup-review-unconfigured">
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">
                        No model is configured.
                      </span>{" "}
                      Set one up and this button will ask it to read the file for the things a
                      check cannot judge — whether a description says when to trigger, whether two
                      entries duplicate each other.
                    </span>
                  </CapabilityNote>
                </div>
              )}
              {reviewError !== null && (
                <p
                  data-testid="setup-review-error"
                  className="mt-3 rounded border border-zinc-200 dark:border-zinc-800 px-2 py-1.5 text-[11.5px] text-zinc-600 dark:text-zinc-300"
                >
                  {reviewError}
                </p>
              )}
              {notes !== null && (
                <div data-testid="setup-review-notes" className="mt-3">
                  <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-violet-500">
                    From the model — judgement, not a check
                  </p>
                  {notes.length === 0 ? (
                    <p data-testid="setup-review-empty" className="text-[11.5px] text-zinc-500">
                      The model read it and had nothing to add.
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {notes.map((n, i) => (
                        <li
                          key={`${n.checkId}-${i}`}
                          data-testid={`setup-review-note-${n.checkId}`}
                          className="rounded border border-violet-200 dark:border-violet-900 px-2 py-1 text-[11.5px]"
                        >
                          {n.message}
                          {n.quote !== null && (
                            <span className="mt-0.5 block font-mono text-[11px] text-zinc-500">
                              {n.quote}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {conflict !== null && (
                <p
                  data-testid="setup-save-conflict"
                  className="mt-3 rounded border border-dashed border-amber-400 dark:border-amber-700 px-2 py-1.5 text-[11.5px] text-amber-700 dark:text-amber-400"
                >
                  {conflict}
                </p>
              )}
              {saveError !== null && (
                <p
                  data-testid="setup-save-error"
                  className="mt-3 rounded border border-rose-300 dark:border-rose-800 px-2 py-1.5 text-[11.5px] text-rose-700 dark:text-rose-400"
                >
                  {saveError}
                </p>
              )}

              {selected.ref !== null && (
                <div className="mt-4 border-t border-zinc-100 dark:border-zinc-800 pt-3.5">
                  <div className="mb-2 flex items-center gap-2">
                    {draft === null ? (
                      <button
                        type="button"
                        onClick={() => setDraft(file.text ?? "")}
                        disabled={file.text === null}
                        data-testid="setup-edit"
                        className="rounded-md border border-zinc-200 dark:border-zinc-800 px-2 py-1 text-[11.5px] text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 disabled:opacity-40"
                      >
                        Edit
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => void save(selected, draft)}
                          disabled={busy}
                          data-testid="setup-save"
                          className="rounded-md border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-[11.5px] font-medium disabled:opacity-40"
                        >
                          {busy ? "Saving…" : "Save"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDraft(null);
                            setSaveError(null);
                            setConflict(null);
                          }}
                          data-testid="setup-cancel"
                          className="rounded-md border border-zinc-200 dark:border-zinc-800 px-2 py-1 text-[11.5px] text-zinc-600 dark:text-zinc-300"
                        >
                          Cancel
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        void runValidate(selected.ref as ClaudeRef, draft ?? undefined)
                      }
                      data-testid="setup-check"
                      className="rounded-md border border-zinc-200 dark:border-zinc-800 px-2 py-1 text-[11.5px] text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                    >
                      Check
                    </button>
                    {/* The only control in this app that spends money. Its label
                        says so, because a button that costs something should not
                        look like one that does not. */}
                    <button
                      type="button"
                      onClick={() => void runReview(selected.ref as ClaudeRef, draft ?? undefined)}
                      disabled={reviewing}
                      data-testid="setup-review"
                      className="rounded-md border border-violet-300 dark:border-violet-800 px-2 py-1 text-[11.5px] text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-950/40 disabled:opacity-40"
                    >
                      {reviewing ? "Asking…" : "Ask the model"}
                    </button>
                    {models !== null && models.length > 0 && (
                      <select
                        value={picked}
                        onChange={(e) => setPicked(e.target.value)}
                        disabled={reviewing}
                        aria-label="Model"
                        data-testid="setup-model-picker"
                        className="rounded-md border border-zinc-200 dark:border-zinc-800 bg-transparent px-1.5 py-1 text-[11.5px] text-zinc-600 dark:text-zinc-300 disabled:opacity-40"
                      >
                        {models.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.id}
                          </option>
                        ))}
                      </select>
                    )}
                    {modelsUnavailable && (
                      <span
                        data-testid="setup-models-unavailable"
                        className="text-[11px] text-zinc-500"
                      >
                        Model list unavailable — using the configured default.
                      </span>
                    )}
                  </div>
                  {draft !== null ? (
                    /* A plain textarea, deliberately. An editor component would
                       bring its own newline and encoding opinions, and this
                       feature's whole promise is that a save changes only what
                       the human changed. */
                    <textarea
                      data-testid="setup-editor"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      spellCheck={false}
                      className="h-72 w-full resize-y rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 p-2 font-mono text-[12px] leading-relaxed outline-none focus:border-violet-500"
                    />
                  ) : file.isError ? (
                    <ErrorState variant="failed" subject={selected.name} />
                  ) : file.isLoading || file.text === null ? (
                    <Skeleton shape="text" label="Reading the file…" />
                  ) : isMarkdown(selected.path) ? (
                    /* Bounded to a reading measure, matching the docs pane. */
                    <div data-testid="setup-file-markdown" className="max-w-[72ch]">
                      <CaptureMarkdown diagrams>{file.text}</CaptureMarkdown>
                    </div>
                  ) : (
                    <div data-testid="setup-file-source">
                      <SourceView path={selected.path} code={file.text} />
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
    </div>
  );
}
