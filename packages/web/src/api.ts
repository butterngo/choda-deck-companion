// TASK-1159 — thin fetch client over the laptop REST adapter (TASK-1158).
// Reads only; the shell needs /sync/health for the status bar. Later pillar
// screens add /sync/ledger, /workflow/focus, /knowledge, etc. against this same
// single base.

import { API_BASE } from "./config";

// Mirror of the adapter's GET /sync/health payload (src/adapters/companion).
export interface SyncHealth {
  loopAlive: boolean;
  lastPullAgeSec: number | null;
  jwtState: "refresh" | "static" | "none" | "unknown";
  reachable: boolean;
}

// One row of the sync ledger — mirror of the adapter's GET /sync/ledger entries
// (src/adapters/companion/sync-ledger). Every local row of an entity falls into
// exactly one bucket (precedence: tombstoned > remote-only > in-sync > local-only).
export interface LedgerRow {
  entity: string;
  inSync: number;
  localOnly: number;
  remoteOnly: number;
  tombstoned: number;
}

// One entry of the durable sync activity log — mirror of the adapter's
// GET /sync/log events (src/adapters/companion/sync-log, backed by TASK-1214's
// sync_events table). `at` is wall-clock epoch ms; the feed formats it as relative
// time the way the StatusBar does for lastPullAge.
export interface SyncEvent {
  id: number;
  at: number;
  kind: "pull" | "push" | "drain" | "conflict";
  upserted: number;
  tombstoned: number;
  pushed: number;
  conflicts: number;
  note: string | null;
}

// Result of a Pull/Push action (POST /sync/pull|push, TASK-1175). Shape is
// permissive — the adapter may return a flat count or per-table detail.
export interface SyncActionResult {
  upserted?: number;
  tombstoned?: number;
  pushed?: number;
  message?: string;
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
  return (await res.json()) as T;
}

async function postJson<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null) as { error?: string } | null;
    throw new Error(detail?.error ?? `HTTP ${res.status} for ${path}`);
  }
  return (await res.json()) as T;
}

export function fetchHealth(signal?: AbortSignal): Promise<SyncHealth> {
  return getJson<SyncHealth>("/sync/health", signal);
}

// TASK-1498 — send a captured/pasted image to a NEW conversation via the shared
// capture bridge (POST /capture, kind:image). The dispatcher writes the image to
// artifacts/ and opens a conversation whose title is payload.title. The bridge
// token is injected by the proxy (TASK-1503), never sent from here. sourceUrl is
// required + non-empty by the contract; the companion has no originating page, so
// it sends a stable marker.
export interface CaptureResult {
  id: string;
  destination: string;
}

export const COMPANION_CAPTURE_SOURCE = "companion-capture";

export function sendImageToConversation(
  args: { dataUrl: string; projectId: string; title: string },
): Promise<CaptureResult> {
  return postJson<CaptureResult>("/capture", {
    kind: "image",
    destination: "conversation",
    payload: { dataUrl: args.dataUrl, projectId: args.projectId, title: args.title },
    sourceUrl: COMPANION_CAPTURE_SOURCE,
  });
}

export function fetchLedger(signal?: AbortSignal): Promise<{ ledger: LedgerRow[] }> {
  return getJson<{ ledger: LedgerRow[] }>("/sync/ledger", signal);
}

// The sync activity feed (GET /sync/log, TASK-1215). Newest-first; the adapter
// defaults to 50 and hard-caps at 200, so an omitted/over-large limit is safe.
export function fetchSyncLog(
  limit?: number,
  signal?: AbortSignal
): Promise<{ events: SyncEvent[] }> {
  const qs = limit === undefined ? "" : `?limit=${limit}`;
  return getJson<{ events: SyncEvent[] }>(`/sync/log${qs}`, signal);
}

// Pull/Push wire to the adapter's mutation endpoints (TASK-1175). They 404 until
// that lands; the UI surfaces the error rather than pretending success.
export function pullSync(): Promise<SyncActionResult> {
  return postJson<SyncActionResult>("/sync/pull");
}

export function pushSync(): Promise<SyncActionResult> {
  return postJson<SyncActionResult>("/sync/push");
}

// Task status as the adapter reports it (src/core/domain/task-types.ts).
// Declared here rather than beside TaskDetail because more than one
// response shape carries it.
export type TaskStatus = "TODO" | "READY" | "IN-PROGRESS" | "IMPLEMENTED" | "DONE" | "CANCELLED";

// TASK-1174 — Knowledgebase browser. Mirrors of the adapter's knowledge/graph
// shapes (src/adapters/companion/knowledge.ts, src/adapters/companion/graph.ts,
// src/core/domain/knowledge-types.ts, src/core/domain/task-types.ts). Only the
// fields the browser renders are declared here.
export type KnowledgeType =
  | "spike"
  | "decision"
  | "postmortem"
  | "learning"
  | "evaluation"
  | "feature"
  | "code_ref"
  | "gotcha";

export interface KnowledgeRefStaleness {
  path: string;
  commitSha: string;
  commitsSince: number;
}

export interface KnowledgeListItem {
  slug: string;
  projectId: string;
  workspaceId: string | null;
  scope: "project" | "cross";
  type: KnowledgeType;
  title: string;
  filePath: string;
  createdAt: string;
  lastVerifiedAt: string;
}

export interface KnowledgeEntry {
  slug: string;
  frontmatter: KnowledgeListItem;
  body: string;
  filePath: string;
  staleness: KnowledgeRefStaleness[];
  isStale: boolean;
}

export interface KnowledgeSearchHit extends KnowledgeListItem {
  distance: number;
  /**
   * TASK-1602 — leading prose of the entry, added to the adapter by TASK-1599.
   *
   * OPTIONAL on purpose, even though the adapter now declares it required. The
   * companion is a long-lived client talking to whatever adapter build happens
   * to be running, and a running instance that predates TASK-1599 simply omits
   * it — confirmed against the live one while building this. Typing it as
   * required would have TypeScript assert a string that is `undefined` at
   * runtime.
   *
   * NOT a matched-term snippet: search is semantic, so a hit may share no
   * literal term with the query. Never highlight it.
   */
  excerpt?: string;
}

export interface KnowledgeSearchResult {
  enabled: boolean;
  reason?: string;
  providerId?: string;
  results: KnowledgeSearchHit[];
}

export interface GraphEdge {
  fromId: string;
  toId: string;
  type: string;
}

export function fetchKnowledgeList(
  type?: KnowledgeType,
  signal?: AbortSignal,
): Promise<{ entries: KnowledgeListItem[] }> {
  const qs = type === undefined ? "" : `?type=${encodeURIComponent(type)}`;
  return getJson<{ entries: KnowledgeListItem[] }>(`/knowledge${qs}`, signal);
}

export function fetchKnowledgeEntry(slug: string, signal?: AbortSignal): Promise<KnowledgeEntry> {
  return getJson<KnowledgeEntry>(`/knowledge/${encodeURIComponent(slug)}`, signal);
}

export function searchKnowledgeEntries(query: string, signal?: AbortSignal): Promise<KnowledgeSearchResult> {
  return getJson<KnowledgeSearchResult>(`/knowledge/search?q=${encodeURIComponent(query)}`, signal);
}

export function fetchGraphEdges(
  nodeId: string,
  direction: "out" | "in" | "both" = "both",
  signal?: AbortSignal,
): Promise<{ edges: GraphEdge[] }> {
  return getJson<{ edges: GraphEdge[] }>(
    `/graph/edges?node=${encodeURIComponent(nodeId)}&direction=${direction}`,
    signal,
  );
}

// TASK-1444 — the full-graph read (TASK-1443): GET /graph/edges with no `node`
// but a `projectId` returns every node in the project (tasks + knowledge + code
// refs) plus every edge whose endpoints are both in that set. Feeds the visual
// GraphView. Node `type` is the coarse 3-way the adapter carries — the SVG view
// colors by it (src/adapters/companion/graph.ts collectProjectNodes).
export type GraphNodeType = "task" | "knowledge" | "code_ref";

export interface GraphNode {
  id: string;
  type: GraphNodeType;
}

export interface FullGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export function fetchFullGraph(projectId: string, signal?: AbortSignal): Promise<FullGraph> {
  return getJson<FullGraph>(`/graph/edges?projectId=${encodeURIComponent(projectId)}`, signal);
}

// TASK-1465 — mirror of the adapter's GET /workspaces (src/adapters/companion,
// fans out over listProjects()/findWorkspaces()). Lets a workspace be picked
// from a real dropdown instead of a manual workspaceId text-entry box.
export interface Workspace {
  id: string;
  projectId: string;
  label: string;
  cwd: string;
  archivedAt: string | null;
}

export function fetchWorkspaces(signal?: AbortSignal): Promise<{ workspaces: Workspace[] }> {
  return getJson<{ workspaces: Workspace[] }>("/workspaces", signal);
}

// TASK-1765 — GET /projects, the top of the browse hierarchy. The adapter
// returns FLAT projects with no nested workspaces[], so a project's workspaces
// come from grouping fetchWorkspaces() by projectId client-side. That is not a
// workaround: /workspaces already carries projectId, so no second round-trip
// per project is needed.
export interface Project {
  id: string;
  name: string;
  cwd: string;
}

export function fetchProjects(signal?: AbortSignal): Promise<{ projects: Project[] }> {
  return getJson<{ projects: Project[] }>("/projects", signal);
}

// TASK-1766 — GET /tasks. Measured 2026-08-24: it takes NO filter (?projectId=
// and ?workspaceId= are both ignored, byte-identical responses) and returns
// every task in every project WITH its full body — 1420 tasks, 4,042,663 bytes.
// Callers must therefore narrow client-side, and must not poll this.
export interface TaskSummary {
  id: string;
  projectId: string;
  parentTaskId: string | null;
  title: string;
  status: string;
  priority: string;
  labels: string[];
}

export function fetchAllTasks(signal?: AbortSignal): Promise<{ tasks: TaskSummary[] }> {
  return getJson<{ tasks: TaskSummary[] }>("/tasks", signal);
}

// TASK-1493 — cross-project search (GET /search?q=). Mirror of the adapter's
// search route (src/adapters/companion/search.ts): task-title + knowledge hits
// across ALL projects, each tagged with projectId. `knowledgeEnabled` is false
// when the adapter's embedding search is degraded (packaged app) — surfaced so
// the UI can say so rather than imply "no knowledge matches".
export interface SearchHit {
  kind: "task" | "knowledge";
  id: string;
  title: string;
  projectId: string;
  status?: string;
}

export interface SearchResult {
  query: string;
  tasks: SearchHit[];
  knowledge: SearchHit[];
  knowledgeEnabled: boolean;
  knowledgeReason: string | null;
}

export function fetchSearch(q: string, signal?: AbortSignal): Promise<SearchResult> {
  return getJson<SearchResult>(`/search?q=${encodeURIComponent(q)}`, signal);
}

// Task detail for the graph node panel — mirror of the adapter's GET /tasks/:id
// (src/adapters/companion/task-detail.ts → svc.getTask). Only the fields the
// detail panel renders are declared.
export interface TaskDetail {
  id: string;
  projectId: string;
  parentTaskId: string | null;
  title: string;
  status: TaskStatus;
  priority: string | null;
  labels: string[];
  body: string | null;
  blockedBy: string[];
  // TASK-1748 — provenance. Optional because an older adapter answers without
  // them, and a companion talking to one must render the task rather than
  // crash on a missing key.
  adrs?: ProvenanceAdr[];
  files?: ProvenanceFile[];
  commits?: ProvenanceCommit[];
  filesConfidence?: FilesConfidence;
}

/** How an ADR was linked to the task. `body` is an inference, not a declaration. */
export type AdrMatch = "frontmatter" | "body";

export interface ProvenanceAdr {
  slug: string;
  title: string;
  via: AdrMatch;
}

export interface ProvenanceFile {
  path: string;
  workspaceId: string | null;
  relation: "modifies" | "reference";
  /** False when the path no longer resolves on disk — the row must not link. */
  exists: boolean;
}

export interface ProvenanceCommit {
  raw: string;
  sha: string;
  subject: string;
  workspaceId: string | null;
  sessionId: string;
}

/**
 * `undeterminable` means the task has commits but no recorded file edits: the
 * edits went through a path the hook cannot see, so the empty list is a gap in
 * the record and not a fact about the work.
 */
export type FilesConfidence = "known" | "undeterminable";

// TASK-1749 — a workspace's own .md docs.
export interface WorkspaceDoc {
  path: string;
  size: number;
  /** TASK-1787 — listed, never served as text. Absent means false. */
  binary?: boolean;
  modifiedAt: string;
}

export interface WorkspaceDocsResult {
  workspaceId: string;
  label: string;
  cwd: string;
  docs: WorkspaceDoc[];
}

/**
 * A workspace whose folder is gone. Distinct from an empty docs list, which is
 * a true statement about the repo — this one is a failure to look.
 */
export class WorkspaceFolderMissingError extends Error {
  constructor(
    readonly label: string,
    readonly cwd: string
  ) {
    super(`workspace folder is missing: ${cwd}`);
    this.name = "WorkspaceFolderMissingError";
  }
}

/**
 * TASK-1788 — asks for the whole tree, code and docs together.
 *
 * `include=all` is sent unconditionally. An adapter that predates TASK-1787
 * ignores the param and answers with markdown only, which is exactly the
 * degradation the adapter's default was chosen to give: the companion consumes
 * a VENDORED bundle that lags a release behind (INBOX-1888), so a new client
 * meeting an old adapter must show fewer files rather than an error.
 */
export async function fetchWorkspaceDocs(
  workspaceId: string,
  signal?: AbortSignal
): Promise<WorkspaceDocsResult> {
  const res = await fetch(
    `${API_BASE}/workspace-docs?workspaceId=${encodeURIComponent(workspaceId)}&include=all`,
    { signal }
  );
  if (res.status === 409) {
    const body = (await res.json()) as { label?: string; cwd?: string };
    throw new WorkspaceFolderMissingError(body.label ?? workspaceId, body.cwd ?? "");
  }
  if (!res.ok) throw new Error(`GET /workspace-docs failed: ${res.status}`);
  return (await res.json()) as WorkspaceDocsResult;
}

/**
 * The adapter answers 415 for a binary file (TASK-1787). Carried as its own
 * error type for the same reason as WorkspaceFolderMissingError: "this file
 * cannot be shown as text" and "this request failed" are different facts, and
 * only one of them means something is broken.
 */
export class BinaryFileError extends Error {
  constructor(readonly path: string) {
    super(`binary file is not served as text: ${path}`);
    this.name = "BinaryFileError";
  }
}

export async function fetchWorkspaceDoc(
  workspaceId: string,
  path: string,
  signal?: AbortSignal
): Promise<string> {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  const res = await fetch(
    `${API_BASE}/workspace-docs/${encodeURIComponent(workspaceId)}/${encoded}`,
    { signal }
  );
  if (res.status === 415) throw new BinaryFileError(path);
  if (!res.ok) throw new Error(`GET /workspace-docs/:id/:path failed: ${res.status}`);
  return await res.text();
}

// TASK-1797/1798 — where is a symbol declared? Mirror of the adapter's
// GET /workspace-symbols (src/adapters/companion/workspace-symbols.ts).
export interface SymbolMatch {
  /** Workspace-relative, forward-slashed — openable by the same viewer. */
  path: string;
  /** 1-based, so it feeds the existing #L<n> anchor unchanged. */
  line: number;
  /** The keyword that anchored the match: class, interface, type, func... */
  kind: string;
  /** The matched source line, trimmed. */
  text: string;
}

export interface SymbolLookupResult {
  workspaceId: string;
  cwd: string;
  name: string;
  matches: SymbolMatch[];
}

/**
 * TASK-1799 — the adapter is older than this route.
 *
 * The companion talks to a VENDORED adapter bundle that refreshes only at
 * release (INBOX-1888), so a released app WILL meet an adapter that has never
 * heard of /workspace-symbols. It answers with the router's own 404, and
 * `/healthz` returns `{ ok: true }` with no capability list — so the BODY is
 * the only signal there is.
 *
 * Carried as its own error type for the same reason as BinaryFileError:
 * "your app is behind" and "that symbol has no declaration" are different
 * facts, and telling the reader the second when the first is true blames the
 * code for the client's age.
 */
export class AdapterRouteMissingError extends Error {
  constructor(readonly route: string) {
    super(`this adapter has no ${route} route`);
    this.name = "AdapterRouteMissingError";
  }
}

/** The other 404: the route exists, the workspace does not. */
export class UnknownWorkspaceError extends Error {
  constructor(readonly workspaceId: string) {
    super(`unknown workspace: ${workspaceId}`);
    this.name = "UnknownWorkspaceError";
  }
}

/**
 * An empty `matches` is a normal 200 — a name may be a local, a keyword, or
 * declared in another workspace. Only the failures throw.
 *
 * The two 404s are separated by reading the error body, and that string
 * comparison is the fragile part of this whole feature: the adapter names the
 * workspace it could not find (`unknown workspace: X`), while an adapter
 * without the route falls through to its router's `not found`. If that router
 * message is ever reworded, this degrades silently to "your app is behind" for
 * a genuinely unknown workspace. INBOX-1897 proposes a capabilities field on
 * /healthz, which would remove the guess entirely.
 */
export async function fetchWorkspaceSymbols(
  workspaceId: string,
  name: string,
  signal?: AbortSignal,
): Promise<SymbolLookupResult> {
  const res = await fetch(
    `${API_BASE}/workspace-symbols?workspaceId=${encodeURIComponent(workspaceId)}&name=${encodeURIComponent(name)}`,
    { signal },
  );
  if (res.status === 404) {
    // Body read defensively: an adapter old enough to lack the route is also
    // old enough to answer something this client has never seen, and a parse
    // failure here must not become a crash on top of a 404.
    let error = "";
    try {
      error = ((await res.json()) as { error?: string }).error ?? "";
    } catch {
      error = "";
    }
    if (error.startsWith("unknown workspace")) throw new UnknownWorkspaceError(workspaceId);
    throw new AdapterRouteMissingError("/workspace-symbols");
  }
  if (!res.ok) throw new Error(`GET /workspace-symbols failed: ${res.status}`);
  return (await res.json()) as SymbolLookupResult;
}

// TASK-1779/1782 — a workspace's git history. Mirror of the adapter's
// GET /workspaces/:id/commits (src/adapters/companion/workspace-commits.ts).
export interface WorkspaceCommit {
  sha: string;
  shortSha: string;
  /** ISO 8601 with offset, as git reports it. */
  authorDate: string;
  subject: string;
  /** Every TASK-id in the subject, deduped. Empty means nobody tagged it. */
  taskIds: string[];
}

export interface WorkspaceCommitsResult {
  workspaceId: string;
  label: string;
  cwd: string;
  commits: WorkspaceCommit[];
  hasMore: boolean;
}

/**
 * The adapter could not read git for this workspace — the cwd is gone, or it is
 * not a repository. Carried as its own error type for the same reason as
 * WorkspaceFolderMissingError: `isError` alone would collapse it into "the
 * request failed", and an audit view has to say which. It must never surface as
 * an empty commit list, which would read as "this repo has no history".
 */
/** TASK-1784 — how attached a commit is to this repo's refs. */
export type CommitReachability = "default-branch" | "branch-only" | "unreachable";

/** TASK-1791 — one line of a unified diff, carrying its real file line numbers. */
export interface DiffLine {
  kind: "add" | "del" | "ctx";
  text: string;
  /** Line number in the OLD file. Null on an added line. */
  oldNo: number | null;
  /** Line number in the NEW file. Null on a removed line. */
  newNo: number | null;
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  /** Text after the second `@@` — git fills it with the enclosing symbol. */
  header: string;
  lines: DiffLine[];
}

export interface CommitFileStat {
  path: string;
  /**
   * Present only when the adapter was asked for a patch AND is new enough to
   * serve one. Three distinct states, and collapsing any two of them tells the
   * reader something untrue:
   *   undefined — this adapter does not serve diffs (vendored bundle lags)
   *   null      — the patch was not produced; `omitted` says why
   *   Hunk[]    — the actual changed lines
   */
  hunks?: DiffHunk[] | null;
  omitted?: "binary" | "too-large";
  /** Set only on a rename. */
  oldPath?: string;
  /** null for a binary file — git reports `-`, and 0 would say it did not change. */
  insertions: number | null;
  deletions: number | null;
  binary: boolean;
}

export interface WorkspaceCommitDetail extends WorkspaceCommit {
  body: string;
  files: CommitFileStat[];
  reachability: CommitReachability;
}

/**
 * TASK-1792 — always asks for the patch.
 *
 * `patch=1` is sent unconditionally. An adapter predating TASK-1791 ignores it
 * and answers without `hunks`, which the panel reports as "this adapter does
 * not serve diffs" rather than as an empty diff. That degradation is why the
 * adapter took a param instead of a new route (INBOX-1888).
 */
export function fetchWorkspaceCommit(
  workspaceId: string,
  sha: string,
  signal?: AbortSignal
): Promise<WorkspaceCommitDetail> {
  return getJson<WorkspaceCommitDetail>(
    `/workspaces/${encodeURIComponent(workspaceId)}/commits/${encodeURIComponent(sha)}?patch=1`,
    signal
  );
}

export class GitUnavailableError extends Error {
  constructor(
    readonly label: string,
    readonly cwd: string
  ) {
    super(`git is unavailable for: ${cwd}`);
    this.name = "GitUnavailableError";
  }
}

export async function fetchWorkspaceCommits(
  workspaceId: string,
  limit: number,
  signal?: AbortSignal
): Promise<WorkspaceCommitsResult> {
  const res = await fetch(
    `${API_BASE}/workspaces/${encodeURIComponent(workspaceId)}/commits?limit=${limit}`,
    { signal }
  );
  if (res.status === 409) {
    const body = (await res.json()) as { label?: string; cwd?: string };
    throw new GitUnavailableError(body.label ?? workspaceId, body.cwd ?? "");
  }
  if (!res.ok) throw new Error(`GET /workspaces/:id/commits failed: ${res.status}`);
  return (await res.json()) as WorkspaceCommitsResult;
}

export function fetchTask(id: string, signal?: AbortSignal): Promise<TaskDetail> {
  return getJson<TaskDetail>(`/tasks/${encodeURIComponent(id)}`, signal);
}

// TASK-1570 — conversations. Mirror of the adapter's GET /conversations (list,
// TASK-1158) and GET /conversations/:id (detail, TASK-1568). Field names follow
// the domain types verbatim — `authorName`, not `author` — because the adapter
// passes domain objects straight through.
export interface ConversationSummary {
  id: string;
  projectId: string;
  title: string;
  status: string;
  createdBy: string;
  decisionSummary: string | null;
  signedOff: string[];
  createdAt: string;
  decidedAt: string | null;
}

export interface ConversationMessage {
  id: string;
  conversationId: string;
  authorName: string;
  content: string;
  kind: "message" | "decision" | "signoff";
  readBy: string[];
  createdAt: string;
}

export interface ConversationParticipant {
  conversationId: string;
  name: string;
}

export interface ConversationDetail {
  conversation: ConversationSummary;
  messages: ConversationMessage[];
  participants: ConversationParticipant[];
}

export function fetchConversations(signal?: AbortSignal): Promise<{ conversations: ConversationSummary[] }> {
  return getJson<{ conversations: ConversationSummary[] }>("/conversations", signal);
}

export function fetchConversation(id: string, signal?: AbortSignal): Promise<ConversationDetail> {
  return getJson<ConversationDetail>(`/conversations/${encodeURIComponent(id)}`, signal);
}

// TASK-1576 — vault notes. The vault is a separate store from the SQLite the
// rest of this file reads: plain markdown under `30-Knowledge/`, served by the
// adapter's read-only /vault routes. Notes written by /choda-watch embed frames
// as relative `assets/...` paths, hence the asset helper below.
export interface VaultNoteSummary {
  slug: string;
  title: string;
  tags: string[];
  captured: string | null;
  generatedBy: string | null;
  source: string | null;
  url: string | null;
}

export function fetchVaultNotes(signal?: AbortSignal): Promise<VaultNoteSummary[]> {
  return getJson<VaultNoteSummary[]>("/vault/notes", signal);
}

export async function fetchVaultNote(slug: string, signal?: AbortSignal): Promise<string> {
  const res = await fetch(`${API_BASE}/vault/notes/${encodeURIComponent(slug)}`, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status} for /vault/notes/${slug}`);
  // Markdown, not JSON — this is the one read route that isn't application/json.
  return await res.text();
}

/**
 * Rewrite a note's relative image paths to the asset route.
 *
 * Notes embed `![10:11](assets/<slug>/10-11.jpg)`, which resolves on disk but
 * not in the browser. Pointing them at `/api/vault/assets/...` also solves auth
 * for free: an <img> cannot send the bridge-token header, but the same-origin
 * proxy injects it on every /api/* request (vite.config.ts, TASK-1503).
 */
export function rewriteVaultAssetPaths(markdown: string): string {
  return markdown.replace(/\]\(assets\//g, `](${API_BASE}/vault/assets/`);
}


// TASK-1828 / TASK-1829 — the effective config inventory seen from a project.
// Mirror of the adapter's GET /claude-config
// (choda-deck/src/adapters/companion/claude-config.ts).
//
// "Effective" is the whole point. ~/.claude/plugins holds 29 SKILL.md files and
// one installed plugin; a tree walk reports 42 skills against a real 15. The
// adapter does that discrimination — this client just renders what it is told.

/**
 * How to ASK for a file, as opposed to where it happens to live.
 *
 * TASK-1831. The adapter's file route refuses absolute paths, so the `path`
 * below is for display and copying and cannot be turned into a request. That
 * gap is why the route shipped with no caller at all — see the task.
 */
export interface ClaudeRef {
  rootId: string;
  /** Forward-slashed, relative to the root. Empty for a file root. */
  rel: string;
}

export interface ClaudeSkill {
  name: string;
  description: string;
  scope: "global" | "plugin";
  /** Non-null exactly when scope is "plugin". */
  pluginId: string | null;
  /** Absolute path, for display and copying. Never sent back as input. */
  path: string;
  ref: ClaudeRef;
}

export interface ClaudeCommand {
  name: string;
  path: string;
  ref: ClaudeRef;
}

export interface ClaudeRule {
  name: string;
  path: string;
  ref: ClaudeRef;
}

/**
 * Three states, not two — measured, not assumed. A `.mcp.json` server that has
 * never been approved is "pending"; one that was rejected is "disabled" and
 * disappears from `claude mcp list` entirely, which is exactly why an inventory
 * still shows it.
 */
export interface McpServer {
  name: string;
  origin: "global" | "project";
  transport: string | null;
  status: "active" | "disabled" | "pending";
  source: string;
  error: string | null;
}

/**
 * What the inventory cannot see, carried with it.
 *
 * `claude mcp list` reports 16 servers on Butter's machine; ~/.claude.json
 * declares 6. The other ten are claude.ai connectors configured account-side
 * and cannot be enumerated from disk. A count is only honest when its boundary
 * travels with it, so the adapter ships the boundary as a field.
 */
export interface McpScope {
  localOnly: boolean;
  note: string;
}

export interface ClaudeConfigResult {
  skills: ClaudeSkill[];
  commands: ClaudeCommand[];
  rules: ClaudeRule[];
  mcpServers: McpServer[];
  mcpScope: McpScope;
}

/**
 * The same two-404 problem as fetchWorkspaceSymbols, and separated the same
 * way: an adapter without the route falls through to its router's "not found",
 * while an adapter that HAS the route names the workspace it could not find.
 * The packaged app carries a vendored bundle that lags a release (INBOX-1888),
 * so "your app is behind" is a state a released build will really reach.
 */
export async function fetchClaudeConfig(
  workspaceId: string | null,
  signal?: AbortSignal,
): Promise<ClaudeConfigResult> {
  const query = workspaceId === null ? "" : `?workspaceId=${encodeURIComponent(workspaceId)}`;
  const res = await fetch(`${API_BASE}/claude-config${query}`, { signal });
  if (res.status === 404) {
    let error = "";
    try {
      error = ((await res.json()) as { error?: string }).error ?? "";
    } catch {
      error = "";
    }
    if (error.startsWith("unknown workspace")) {
      throw new UnknownWorkspaceError(workspaceId ?? "");
    }
    throw new AdapterRouteMissingError("/claude-config");
  }
  if (!res.ok) throw new Error(`GET /claude-config failed: ${res.status}`);
  return (await res.json()) as ClaudeConfigResult;
}

/**
 * One configured file, as text.
 *
 * Built from the row's own `ref` rather than from its display path: the route
 * takes a root id plus a relative path and refuses absolutes, which is the
 * whole reason a display path could not be turned into a request.
 *
 * A file root (`claude-md`) has an empty `rel`, so the URL is just the root.
 */
function refUrl(ref: ClaudeRef): string {
  const tail = ref.rel === "" ? "" : `/${ref.rel.split("/").map(encodeURIComponent).join("/")}`;
  return `${API_BASE}/claude-config/${encodeURIComponent(ref.rootId)}${tail}`;
}

export interface ClaudeConfigFile {
  text: string;
  /** The server's etag — a content hash, sent back as `if-match` on save. */
  sha256: string;
}

/**
 * Read a config file AS BYTES, then decode with `ignoreBOM: true`.
 *
 * TASK-1844, and this is not fussiness. `Response.text()` performs a UTF-8
 * decode that STRIPS a leading BOM, so a client that reads with `.text()` and
 * saves the string back silently rewrites every BOM-carrying file it touches —
 * including `template-registry.json`, whose BOM has already broken `JSON.parse`
 * in production once. The adapter pins this hazard with its own test; this is
 * the client half.
 *
 * Measured, not assumed: default decode drops the BOM, `ignoreBOM: true` keeps
 * it as U+FEFF, and encoding that string back produces byte-identical output
 * with CRLF intact.
 */
export async function fetchClaudeConfigFile(
  ref: ClaudeRef,
  signal?: AbortSignal,
): Promise<ClaudeConfigFile> {
  const res = await fetch(refUrl(ref), { signal });
  if (!res.ok) throw new Error(`GET /claude-config/${ref.rootId} failed: ${res.status}`);
  const bytes = await res.arrayBuffer();
  return {
    text: new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes),
    sha256: (res.headers.get("etag") ?? "").replace(/^"|"$/g, ""),
  };
}

/** The save refused because the file moved under the reader. */
export class ConfigChangedOnDiskError extends Error {
  constructor(readonly sha256: string) {
    super("file changed on disk");
    this.name = "ConfigChangedOnDiskError";
  }
}

/** The save was refused by the adapter, with the reason it gave. */
export class ConfigSaveRefusedError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ConfigSaveRefusedError";
  }
}

/**
 * Save a config file.
 *
 * `if-match` is REQUIRED by the adapter and carries the hash the read returned.
 * Sending anything else — or nothing — turns the server's precondition into
 * decoration, which is the clobber it exists to prevent.
 *
 * The body is encoded from the string, so a preserved BOM goes back out as
 * bytes exactly as it came in.
 */
export async function saveClaudeConfigFile(
  ref: ClaudeRef,
  text: string,
  ifMatch: string,
): Promise<ClaudeConfigFile> {
  const res = await fetch(refUrl(ref), {
    method: "PUT",
    headers: { "if-match": ifMatch, "content-type": "text/plain; charset=utf-8" },
    body: new TextEncoder().encode(text),
  });
  if (res.status === 409) {
    const body = (await res.json().catch(() => ({}))) as { sha256?: string };
    throw new ConfigChangedOnDiskError(body.sha256 ?? "");
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ConfigSaveRefusedError(res.status, body.error ?? `save failed: ${res.status}`);
  }
  const saved = (await res.json()) as { sha256?: string };
  return { text, sha256: saved.sha256 ?? "" };
}

export interface ConfigFinding {
  checkId: string;
  severity: "error" | "warning" | "note";
  message: string;
  line: number | null;
}

/**
 * Deterministic checks over a file. Free, and reaches no provider — the model
 * call has its own route so a parameter here can never spend money.
 *
 * `text` is sent when the editor holds unsaved changes, so what is checked is
 * what the reader is looking at rather than what is on disk.
 */
export async function validateClaudeConfig(
  ref: ClaudeRef,
  text?: string,
): Promise<ConfigFinding[]> {
  const res = await fetch(`${API_BASE}/claude-config/validate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ rootId: ref.rootId, rel: ref.rel, ...(text === undefined ? {} : { text }) }),
  });
  if (!res.ok) throw new Error(`POST /claude-config/validate failed: ${res.status}`);
  return ((await res.json()) as { findings?: ConfigFinding[] }).findings ?? [];
}
