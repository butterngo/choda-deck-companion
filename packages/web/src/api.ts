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

// TASK-1173 — Workflow Cockpit. Mirrors of the adapter's task/session shapes
// (src/adapters/companion/workflow.ts, src/core/domain/task-types.ts). Only the
// fields the Cockpit renders are declared here.
export type TaskStatus = "TODO" | "READY" | "IN-PROGRESS" | "IMPLEMENTED" | "DONE" | "CANCELLED";

export interface FocusTask {
  id: string;
  title: string;
  status: TaskStatus;
  priority: string | null;
}

export interface FocusSession {
  id: string;
  taskId: string | null;
  status: "active" | "completed";
  handoff?: { resumePoint?: string };
  checkpoint?: { resumePoint?: string };
}

// Mirror of GET /workflow/focus (src/adapters/companion/workflow.ts FocusFeed).
export interface FocusFeed {
  workspaceId: string;
  projectId: string;
  activeSession: FocusSession | null;
  focusTask: FocusTask | null;
  now: FocusTask[];
  next: FocusTask[];
  done: FocusTask[];
}

export interface InboxItem {
  id: string;
  projectId: string | null;
  workspaceId: string | null;
  content: string;
  status: "raw" | "researching" | "ready" | "converted" | "archived";
  linkedTaskId: string | null;
}

export function fetchFocus(workspaceId: string, signal?: AbortSignal): Promise<FocusFeed> {
  return getJson<FocusFeed>(`/workflow/focus?workspaceId=${encodeURIComponent(workspaceId)}`, signal);
}

// GET /inbox has no workspaceId query param on the adapter today — it returns
// every project's inbox. The Cockpit filters client-side by projectId (see
// use-inbox.ts); a real workspaceId scope needs an adapter change (tracked as a
// loose end, not silently worked around here).
export function fetchInbox(signal?: AbortSignal): Promise<{ inbox: InboxItem[] }> {
  return getJson<{ inbox: InboxItem[] }>("/inbox", signal);
}

export function markTaskReady(taskId: string): Promise<{ task: FocusTask }> {
  return postJson<{ task: FocusTask }>(`/tasks/${encodeURIComponent(taskId)}/ready`);
}

export function startWorkflowSession(
  projectId: string,
  workspaceId: string,
  taskId: string,
): Promise<FocusSession> {
  return postJson<FocusSession>("/sessions", { projectId, workspaceId, taskId });
}

export function endWorkflowSession(sessionId: string, resumePoint?: string): Promise<FocusSession> {
  return postJson<FocusSession>(`/sessions/${encodeURIComponent(sessionId)}/end`, { resumePoint });
}

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
// fans out over listProjects()/findWorkspaces()). Lets the Cockpit offer a
// real dropdown instead of a manual workspaceId text-entry box.
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

export async function fetchWorkspaceDocs(
  workspaceId: string,
  signal?: AbortSignal
): Promise<WorkspaceDocsResult> {
  const res = await fetch(
    `${API_BASE}/workspace-docs?workspaceId=${encodeURIComponent(workspaceId)}`,
    { signal }
  );
  if (res.status === 409) {
    const body = (await res.json()) as { label?: string; cwd?: string };
    throw new WorkspaceFolderMissingError(body.label ?? workspaceId, body.cwd ?? "");
  }
  if (!res.ok) throw new Error(`GET /workspace-docs failed: ${res.status}`);
  return (await res.json()) as WorkspaceDocsResult;
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
  if (!res.ok) throw new Error(`GET /workspace-docs/:id/:path failed: ${res.status}`);
  return await res.text();
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
