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

import { useState } from "react";
import { useClaudeConfig } from "../hooks/use-claude-config";
import { CapabilityNote } from "../components/state/CapabilityNote";
import { EmptyState } from "../components/state/EmptyState";
import { ErrorState } from "../components/state/ErrorState";
import { Skeleton } from "../components/state/Skeleton";
import { CaptureMarkdown } from "../components/CaptureMarkdown";
import { SourceView } from "../components/SourceView";
import { useClaudeConfigFile } from "../hooks/use-claude-config-file";
import { isMarkdown } from "./WorkspaceDocsView";
import type { ClaudeConfigResult, ClaudeRef, McpServer } from "../api";

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

  return (
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
                {group.rows.map((row) => (
                  <li key={row.key}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(row);
                        setCopied(false);
                      }}
                      aria-current={selected?.key === row.key ? "true" : undefined}
                      data-testid={`setup-row-${row.key}`}
                      className={[
                        "flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-left",
                        selected?.key === row.key
                          ? "border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50"
                          : "border-transparent hover:bg-zinc-50 dark:hover:bg-zinc-800/50",
                      ].join(" ")}
                    >
                      <span className="min-w-0 flex-1 truncate text-[13.5px]">{row.name}</span>
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
              {selected.ref !== null && (
                <div className="mt-4 border-t border-zinc-100 dark:border-zinc-800 pt-3.5">
                  {file.isError ? (
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
  );
}
