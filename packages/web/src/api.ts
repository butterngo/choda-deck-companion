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

// TASK-1995 — send one meeting action item to the inbox (POST /capture,
// kind:text, destination:inbox). Nothing is sent automatically: the dispatcher
// is the same bridge the extension uses, and the row it writes is a raw inbox
// item, so an accidental send is real work someone has to triage away.
//
// projectId is required by the dispatcher's parseTarget, not optional here.
export function sendTextToInbox(args: { text: string; projectId: string }): Promise<CaptureResult> {
  return postJson<CaptureResult>("/capture", {
    kind: "text",
    destination: "inbox",
    payload: { text: args.text, projectId: args.projectId },
    sourceUrl: COMPANION_CAPTURE_SOURCE,
  });
}

/**
 * TASK-2003 — delete a meeting's audio and keep its transcript. Destructive and
 * irreversible, so the caller is expected to have confirmed with the user first;
 * this function does not ask.
 */
export async function deleteMeetingAudio(id: string): Promise<{ freedBytes: number }> {
  const res = await fetch(`${API_BASE}/meetings/${encodeURIComponent(id)}/audio`, {
    method: "DELETE",
  });
  const body = (await res.json().catch(() => ({}))) as { freedBytes?: number; error?: string };
  if (!res.ok) throw new Error(body.error ?? `deleting audio failed: ${res.status}`);
  return { freedBytes: body.freedBytes ?? 0 };
}

/**
 * TASK-2043 — rename a meeting. `title: null` clears it and the row falls back
 * to its timestamp.
 *
 * Telling "this adapter has no rename" from "this meeting is gone" takes care,
 * because the two adapters answer DIFFERENTLY and neither answer is obviously
 * one or the other:
 *
 *   - An adapter predating the route has no one-segment branch, so PATCH
 *     /meetings/:id falls through to its catch-all and answers **400** with
 *     `expected /meetings/<id>/chunk or /meetings/<id>/finalize`.
 *   - An adapter that HAS the route answers 404 only when the directory is
 *     really absent, and 400 only when it rejected the title.
 *
 * So 404 means the meeting is gone — never a stale build — and the old adapter
 * is recognised by its own sentence. Matching on an error string is brittle, and
 * it is used here rather than in reverse (assuming any 400 means "stale") so the
 * brittleness fails SAFE: an unrecognised 400 surfaces as a real error instead of
 * silently hiding the rename control.
 */
const LEGACY_MEETINGS_400 = "expected /meetings/";

/**
 * Mirror of the adapter's TITLE_MAX_CHARS (choda-deck meeting-title.ts). Used to
 * cap the input so the person sees the limit while typing rather than losing the
 * save to a 400 after it.
 */
export const MEETING_TITLE_MAX_CHARS = 120;

export async function renameMeeting(id: string, title: string | null): Promise<string | null> {
  const res = await fetch(`${API_BASE}/meetings/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title }),
  });
  const body = (await res.json().catch(() => ({}))) as { title?: string | null; error?: string };
  if (res.status === 400 && (body.error ?? "").startsWith(LEGACY_MEETINGS_400)) {
    throw new MeetingsRouteMissingError();
  }
  // 405 is the same story told by an adapter that grew some other one-segment
  // route later: the path is known, this verb is not.
  if (res.status === 405) throw new MeetingsRouteMissingError();
  if (!res.ok) throw new Error(body.error ?? `rename failed: ${res.status}`);
  return body.title ?? null;
}

/**
 * TASK-2044 — delete a meeting entirely: audio, transcript, note and all.
 *
 * Distinct from `deleteMeetingAudio`, which keeps the meeting and drops only its
 * expensive half. This one is irreversible and leaves nothing behind, so the
 * caller is expected to have confirmed with the user first; this function does
 * not ask.
 *
 * Route-missing is detected the same way `renameMeeting` does it and for the
 * same reason — see the comment there.
 */
export async function deleteMeeting(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/meetings/${encodeURIComponent(id)}`, { method: "DELETE" });
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (res.status === 400 && (body.error ?? "").startsWith(LEGACY_MEETINGS_400)) {
    throw new MeetingsRouteMissingError();
  }
  if (res.status === 405) throw new MeetingsRouteMissingError();
  if (!res.ok) throw new Error(body.error ?? `deleting meeting failed: ${res.status}`);
}

/** Mirror of the adapter's vault-projects.ts shapes (TASK-2048). */
export type VaultMeetingFileName = "note.md" | "transcript.md";

export interface VaultMeetingFile {
  name: VaultMeetingFileName;
  present: boolean;
  /** Null when absent — distinct from a real zero-byte file. */
  bytes: number | null;
}

export interface VaultMeeting {
  folder: string;
  /** Null when the folder name carries no date; the folder still lists. */
  date: string | null;
  slug: string | null;
  files: VaultMeetingFile[];
}

export interface ProjectVault {
  projectId: string;
  /** False when nothing has ever been saved for this project. */
  exists: boolean;
  /** Reported either way — existing or not, this is the path that would be used. */
  relativePath: string;
  contextFile: boolean;
  meetings: VaultMeeting[];
}

/**
 * `GET /vault/projects/:id` answered 404 — the route is missing from a vendored
 * adapter. Modelled like MeetingsRouteMissingError: "this build cannot read the
 * vault" and "this project has nothing saved" must never look the same, because
 * the second is a normal state five of twelve projects are in.
 */
export class ProjectVaultRouteMissingError extends Error {
  constructor() {
    super("vault projects route not present on this adapter");
    this.name = "ProjectVaultRouteMissingError";
  }
}

export async function fetchProjectVault(
  projectId: string,
  signal?: AbortSignal,
): Promise<ProjectVault> {
  const res = await fetch(`${API_BASE}/vault/projects/${encodeURIComponent(projectId)}`, { signal });
  // The adapter answers 200 with exists:false for an unknown project, so a 404
  // here can only mean the route itself is absent.
  if (res.status === 404) throw new ProjectVaultRouteMissingError();
  if (!res.ok) throw new Error(`project vault lookup failed: ${res.status}`);
  return (await res.json()) as ProjectVault;
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
  /**
   * TASK-1773 — which arm of the §5.3 cascade claimed this task for the
   * requested workspace: a code_ref that belongs to it, a session that ran in
   * it, or neither.
   *
   * Absent when no workspace was asked about — AND absent on every row when the
   * adapter predates TASK-1773, because that adapter ignores `?workspaceId=`
   * and answers with the unscoped table. The two cases are told apart by the
   * caller, not here: asking for a workspace and getting rows with no `scope`
   * is the old-adapter signature.
   */
  scope?: "touches" | "session" | "unscoped";
}

export function fetchAllTasks(signal?: AbortSignal): Promise<{ tasks: TaskSummary[] }> {
  return getJson<{ tasks: TaskSummary[] }>("/tasks", signal);
}

/**
 * TASK-1773 — the workspace-scoped list. Narrows server-side to the workspace's
 * project and annotates every row with its cascade bucket, instead of pulling
 * 4 MB of every task in the database and filtering in the browser.
 */
export function fetchWorkspaceTasks(
  workspaceId: string,
  signal?: AbortSignal,
): Promise<{ tasks: TaskSummary[] }> {
  return getJson<{ tasks: TaskSummary[] }>(
    `/tasks?workspaceId=${encodeURIComponent(workspaceId)}`,
    signal,
  );
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

/** A document plus what a save has to send back to prove it read this version. */
export interface WorkspaceDocContent {
  text: string;
  /** sha256 of the BYTES on disk, from the response's etag. Null on an old adapter. */
  etag: string | null;
}

/**
 * TASK-1937 — read the document as BYTES, not through `res.text()`.
 *
 * `Response.text()` strips a leading BOM. A client that decodes that way hands
 * back a file it has already altered, and the server — which is deliberately
 * byte-exact — faithfully writes the alteration. `git diff` then shows the whole
 * file as modified with the real edit buried inside it. TASK-1849 recorded this
 * hazard; this is the reader that respects it.
 */
export async function fetchWorkspaceDoc(
  workspaceId: string,
  path: string,
  signal?: AbortSignal
): Promise<WorkspaceDocContent> {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  const res = await fetch(
    `${API_BASE}/workspace-docs/${encodeURIComponent(workspaceId)}/${encoded}`,
    { signal }
  );
  if (res.status === 415) throw new BinaryFileError(path);
  if (!res.ok) throw new Error(`GET /workspace-docs/:id/:path failed: ${res.status}`);
  const bytes = await res.arrayBuffer();
  return {
    text: new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes),
    etag: res.headers.get("etag"),
  };
}

/** Why a save was refused, so the pane can say which limit was hit. */
export type SaveDocFailure =
  | "changed-on-disk"
  | "precondition-missing"
  | "too-large"
  | "not-text"
  | "not-found"
  | "unknown";

export class SaveDocError extends Error {
  constructor(
    readonly kind: SaveDocFailure,
    message: string,
    /** Present on a 409: what is on disk now, so a reader can re-read. */
    readonly sha256: string | null = null
  ) {
    super(message);
    this.name = "SaveDocError";
  }
}

/**
 * PUT the document back, byte-exact and behind the precondition.
 *
 * The text is encoded here and sent as bytes; the BOM survives because the
 * reader above never removed it. `ifMatch` is the etag that came with the read —
 * a save without it is refused by the server, which is the point.
 */
export async function saveWorkspaceDoc(
  workspaceId: string,
  path: string,
  text: string,
  ifMatch: string
): Promise<{ sha256: string; bytes: number }> {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  const res = await fetch(
    `${API_BASE}/workspace-docs/${encodeURIComponent(workspaceId)}/${encoded}`,
    {
      method: "PUT",
      headers: { "if-match": ifMatch, "content-type": "application/octet-stream" },
      body: new TextEncoder().encode(text),
    }
  );
  if (res.ok) return (await res.json()) as { sha256: string; bytes: number };

  const body = (await res.json().catch(() => ({}))) as { error?: string; sha256?: string };
  // Each limit gets its own kind. Collapsing them into one failure tells the
  // reader nothing about which one they hit, which is the difference between
  // "try again" and "this file is too big".
  const kind: SaveDocFailure =
    res.status === 409
      ? "changed-on-disk"
      : res.status === 400
        ? "precondition-missing"
        : res.status === 413
          ? "too-large"
          : res.status === 415
            ? "not-text"
            : res.status === 404
              ? "not-found"
              : "unknown";
  throw new SaveDocError(kind, body.error ?? `save failed: ${res.status}`, body.sha256 ?? null);
}

/** The typed provider failures the pane renders differently. */
export type DiagramFailure =
  | "no-model"
  | "does-not-parse"
  | "rate-limit"
  | "network"
  | "auth"
  | "provider"
  // TASK-1943 — the adapter resolved a DIFFERENT fence than the one this client
  // is showing. Its own kind rather than a generic failure, because the only
  // useful response is "reload the document", and a reader told "the provider
  // failed" would retry forever against a disagreement that never resolves.
  | "fence-mismatch";

export class DiagramError extends Error {
  constructor(
    readonly kind: DiagramFailure,
    message: string,
    /** The parser's complaint, on a 422. */
    readonly parseError: string | null = null
  ) {
    super(message);
    this.name = "DiagramError";
  }
}

/**
 * Ask the model for a replacement diagram. Costs money, and is only ever called
 * from a press — never on open, on save, on selection or on a timer.
 *
 * The adapter parses the answer before returning it, so a 200 here is always a
 * diagram that at least parses. Whether it DRAWS is what the preview is for.
 */
export async function proposeDiagram(input: {
  workspaceId: string;
  rel: string;
  fenceIndex: number;
  instruction: string;
  /**
   * TASK-1943 — the fence body THIS client is looking at.
   *
   * `fenceIndex` means the ADAPTER's index, and the adapter finds fences with a
   * second implementation of `listMermaidFences` that lives in another
   * repository and cannot be imported here. Should the two ever disagree, index
   * 1 on screen and index 1 there are different diagrams — and the model would
   * be asked to rewrite one the reader never chose, with no error anywhere.
   *
   * Sending the text lets the adapter refuse (409) instead of serving the wrong
   * fence. Optional on the wire so an older adapter still works; sending it
   * costs nothing and removes a silent failure.
   */
  fenceText?: string;
}): Promise<{ mermaid: string; attempts: number }> {
  const res = await fetch(`${API_BASE}/workspace-docs/diagram`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (res.ok) return (await res.json()) as { mermaid: string; attempts: number };

  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    kind?: string;
    parseError?: string;
    detail?: string;
  };
  if (res.status === 501) throw new DiagramError("no-model", body.error ?? "no model configured");
  if (res.status === 422) {
    throw new DiagramError(
      "does-not-parse",
      body.error ?? "the model's diagram does not parse",
      body.parseError ?? null
    );
  }
  if (res.status === 429) throw new DiagramError("rate-limit", "the model is rate limited");
  // TASK-1943 — the fence-text precondition refused. The document on disk is not
  // what this pane is showing, so editing would have rewritten another diagram.
  if (res.status === 409) {
    throw new DiagramError(
      "fence-mismatch",
      body.error ?? "fence text does not match",
      body.detail ?? null
    );
  }
  const kind: DiagramFailure =
    body.kind === "network" ? "network" : body.kind === "auth" ? "auth" : "provider";
  throw new DiagramError(kind, body.error ?? `diagram request failed: ${res.status}`);
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
  omitted?: "binary" | "too-large" | "no-patch";
  /** The cap the adapter applied, in bytes. Present only with `too-large`. */
  capBytes?: number;
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

/**
 * A model's judgement about a file, as opposed to a check's verdict.
 *
 * TASK-1845. Kept as its own type rather than reusing ConfigFinding, because
 * the two must never be rendered alike: a finding is a fact — a missing field
 * is missing — while a note is an opinion that can be wrong. Sharing the shape
 * is how a wrong opinion inherits a check's authority.
 */
export interface ReviewNote {
  checkId: string;
  message: string;
  /** The span the note is about, quoted from the file, or null. */
  quote: string | null;
}

/** No model is configured. The normal state of most machines, not a failure. */
export class ReviewUnavailableError extends Error {
  constructor() {
    super("no model configured");
    this.name = "ReviewUnavailableError";
  }
}

/** The provider was reached and did not answer usefully. `kind` says how. */
export class ReviewFailedError extends Error {
  constructor(
    readonly kind: string,
    message: string,
  ) {
    super(message);
    this.name = "ReviewFailedError";
  }
}

/**
 * Ask the model about one file. THIS IS THE ONLY CALL IN THE CLIENT THAT COSTS
 * MONEY, and it has its own route for that reason — no parameter on /validate
 * can reach a provider. The UI's job is to not undo that by calling this from
 * anywhere but a button.
 */
/** One entry's verdict from the whole-inventory sweep. */
export interface ConfigSweepEntry {
  ref: ClaudeRef;
  findings: ConfigFinding[];
  /** Why this entry could not be read, or null. A dangling symlink is normal. */
  unreadable: string | null;
}

/**
 * TASK-1859 — check everything, once, on open.
 *
 * A GET, and it reaches no provider: the checks read bytes and apply
 * declarations. That is what makes it safe to run automatically, and it is the
 * only reason the header can state a verdict instead of leaving the reader to
 * discover it one click at a time.
 */
export async function sweepClaudeConfig(signal?: AbortSignal): Promise<ConfigSweepEntry[]> {
  const res = await fetch(`${API_BASE}/claude-config/validate-all`, { signal });
  if (!res.ok) throw new Error(`config sweep failed: ${res.status}`);
  return ((await res.json()) as { results?: ConfigSweepEntry[] }).results ?? [];
}

/** A deployment the configured resource actually has and that can answer a chat. */
export interface ReviewModel {
  id: string;
  model: string;
}

export interface ReviewModelList {
  models: ReviewModel[];
  /** The deployment the adapter falls back to when nothing is picked. */
  selected: string;
}

/**
 * TASK-1856 — what the picker offers. A GET, and it reaches no provider: the
 * adapter reads the resource's own deployment list. Calling it costs nothing,
 * which is why it is safe to call on open while `reviewClaudeConfig` is not.
 */
export async function fetchReviewModels(signal?: AbortSignal): Promise<ReviewModelList> {
  const res = await fetch(`${API_BASE}/claude-config/models`, { signal });
  if (res.status === 501) throw new ReviewUnavailableError();
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { kind?: string; error?: string };
    throw new ReviewFailedError(body.kind ?? "api", body.error ?? `model listing failed`);
  }
  const body = (await res.json()) as Partial<ReviewModelList>;
  return { models: body.models ?? [], selected: body.selected ?? "" };
}

export async function reviewClaudeConfig(
  ref: ClaudeRef,
  text?: string,
  checkId?: string,
  /** The deployment the reader picked. Omitted means the adapter's default. */
  model?: string,
): Promise<ReviewNote[]> {
  const res = await fetch(`${API_BASE}/claude-config/review`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      rootId: ref.rootId,
      rel: ref.rel,
      ...(text === undefined ? {} : { text }),
      ...(checkId === undefined ? {} : { checkId }),
      ...(model === undefined ? {} : { model }),
    }),
  });
  if (res.status === 501) throw new ReviewUnavailableError();
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { kind?: string; error?: string };
    throw new ReviewFailedError(body.kind ?? "api", body.error ?? `review failed: ${res.status}`);
  }
  return ((await res.json()) as { notes?: ReviewNote[] }).notes ?? [];
}

/** One criterion's verdict from the grader. `suggestion` is text to read, never a write. */
export interface AcVerdict {
  index: number;
  text: string;
  /** TASK-1913 — `unanswered` means the model returned no row for this index. */
  verdict: "ok" | "weak" | "unanswered";
  concern: string | null;
  suggestion: string | null;
}

/** No criteria to grade, or no such task. Not an error worth painting red. */
export class AcNothingToGradeError extends Error {
  constructor() {
    super("no acceptance criteria");
    this.name = "AcNothingToGradeError";
  }
}

/**
 * TASK-1860 — grade a task's acceptance criteria against /choda-plan §3d.
 *
 * Costs money, so it is reached from exactly one place: a button. Never on open,
 * never on a status change. The adapter gives it its own route for the same
 * reason /review has one.
 */
export async function reviewTaskAc(taskId: string, model?: string): Promise<AcVerdict[]> {
  const res = await fetch(`${API_BASE}/tasks/ac-review`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ taskId, ...(model === undefined ? {} : { model }) }),
  });
  if (res.status === 501) throw new ReviewUnavailableError();
  if (res.status === 404) throw new AcNothingToGradeError();
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { kind?: string; error?: string };
    throw new ReviewFailedError(body.kind ?? "api", body.error ?? `grading failed: ${res.status}`);
  }
  return ((await res.json()) as { criteria?: AcVerdict[] }).criteria ?? [];
}

/** A container as the daemon reports it, plus the workspace it belongs to. */
export interface DockerContainer {
  id: string;
  name: string;
  state: string;
  status: string;
  image: string;
  project: string | null;
  workingDir: string | null;
  /** Null when the container carries no compose label. Never guessed. */
  workspaceId: string | null;
}

/** Docker is not installed, or the daemon is not answering. Not a failure. */
export class DockerUnavailableError extends Error {
  constructor() {
    super("docker not available");
    this.name = "DockerUnavailableError";
  }
}

/**
 * TASK-1865 — every container the daemon reports, running or not.
 *
 * A GET that costs nothing but 206 ms over this machine's real 25 containers,
 * which is what makes it safe to load on open.
 */
export async function fetchDockerContainers(signal?: AbortSignal): Promise<DockerContainer[]> {
  const res = await fetch(`${API_BASE}/docker/containers`, { signal });
  if (res.status === 501) throw new DockerUnavailableError();
  if (!res.ok) throw new Error(`docker listing failed: ${res.status}`);
  return ((await res.json()) as { containers?: DockerContainer[] }).containers ?? [];
}

export async function fetchDockerLogs(id: string, tail = 200): Promise<string[]> {
  const res = await fetch(`${API_BASE}/docker/logs?id=${encodeURIComponent(id)}&tail=${tail}`);
  if (res.status === 501) throw new DockerUnavailableError();
  if (!res.ok) throw new Error(`docker logs failed: ${res.status}`);
  return ((await res.json()) as { lines?: string[] }).lines ?? [];
}

export type DockerAction = "start" | "stop" | "restart";

/** The action ran but the container did not reach the state asked for. */
export class DockerStillRunningError extends Error {
  constructor(readonly tookMs: number) {
    super("still running");
    this.name = "DockerStillRunningError";
  }
}

/**
 * TASK-1866 — start, stop or restart one container.
 *
 * The only call in this client that changes the machine, and it is reached from
 * exactly one place: a confirmation the reader accepted. The returned `state` is
 * read back from the daemon by the adapter, so it is what IS rather than what
 * was asked for.
 */
export async function actOnContainer(
  id: string,
  action: DockerAction,
  timeoutSeconds?: number,
): Promise<{ id: string; state: string; tookMs: number }> {
  const res = await fetch(
    `${API_BASE}/docker/containers/${encodeURIComponent(id)}/${action}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(timeoutSeconds === undefined ? {} : { timeoutSeconds }),
    },
  );
  if (res.status === 501) throw new DockerUnavailableError();
  if (res.status === 409) {
    const b = (await res.json().catch(() => ({}))) as { tookMs?: number };
    throw new DockerStillRunningError(b.tookMs ?? 0);
  }
  if (!res.ok) throw new Error(`docker ${action} failed: ${res.status}`);
  return (await res.json()) as { id: string; state: string; tookMs: number };
}

export interface DockerImage {
  id: string;
  repository: string;
  tag: string;
  size: string;
  createdAt: string;
  /** Containers holding this image. Non-empty means removal will be refused. */
  inUseBy: string[];
}

export async function fetchDockerImages(signal?: AbortSignal): Promise<DockerImage[]> {
  const res = await fetch(`${API_BASE}/docker/images`, { signal });
  if (res.status === 501) throw new DockerUnavailableError();
  if (!res.ok) throw new Error(`docker images failed: ${res.status}`);
  return ((await res.json()) as { images?: DockerImage[] }).images ?? [];
}

/** The adapter refuses before the daemon does, and names the holders. */
export class ImageInUseError extends Error {
  constructor(readonly by: string[]) {
    super("in use");
    this.name = "ImageInUseError";
  }
}

export async function removeDockerImage(id: string): Promise<{ id: string; freed: string }> {
  const res = await fetch(`${API_BASE}/docker/images/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (res.status === 501) throw new DockerUnavailableError();
  if (res.status === 409) {
    const b = (await res.json().catch(() => ({}))) as { by?: string[] };
    throw new ImageInUseError(b.by ?? []);
  }
  if (!res.ok) throw new Error(`remove failed: ${res.status}`);
  return (await res.json()) as { id: string; freed: string };
}

export async function pruneDockerImages(): Promise<{ removed: number; freed: string }> {
  const res = await fetch(`${API_BASE}/docker/images/prune`, { method: "POST" });
  if (res.status === 501) throw new DockerUnavailableError();
  if (!res.ok) throw new Error(`prune failed: ${res.status}`);
  return (await res.json()) as { removed: number; freed: string };
}

export interface RunPort {
  host: number;
  container: number;
}

/** The name is already used by another container. */
export class ContainerNameTakenError extends Error {
  constructor() {
    super("name taken");
    this.name = "ContainerNameTakenError";
  }
}

/**
 * TASK-1874 — create a container from an image the daemon already holds.
 *
 * The body carries exactly three fields. The adapter refuses any other, so a
 * future caller cannot smuggle volumes past a permissive parser — and this
 * client does not offer them either.
 */
export async function runContainer(
  imageId: string,
  name: string,
  ports: RunPort[],
): Promise<{ id: string; name: string; state: string }> {
  const res = await fetch(`${API_BASE}/docker/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ imageId, name, ports }),
  });
  if (res.status === 501) throw new DockerUnavailableError();
  if (res.status === 409) throw new ContainerNameTakenError();
  if (!res.ok) {
    const b = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(b.error ?? `run failed: ${res.status}`);
  }
  return (await res.json()) as { id: string; name: string; state: string };
}

export interface ContainerFile {
  /** The line exactly as the container's own ls printed it. */
  raw: string;
  name: string;
  mode: string;
  owner: string;
  group: string;
  size: string;
}

/** The command exited non-zero — usually no such path. */
export class ContainerPathError extends Error {
  constructor(readonly path: string) {
    super(`no such path: ${path}`);
    this.name = "ContainerPathError";
  }
}

/** The file is too big, or is not text. Both are refusals, not failures. */
export class ContainerFileUnreadable extends Error {
  constructor(readonly why: "too-large" | "not-text") {
    super(why);
    this.name = "ContainerFileUnreadable";
  }
}

async function execGet(kind: "ls" | "cat", id: string, path: string): Promise<Response> {
  return fetch(
    `${API_BASE}/docker/exec/${kind}?id=${encodeURIComponent(id)}&path=${encodeURIComponent(path)}`,
  );
}

/** TASK-1875 — list a directory inside a running container. */
export async function listContainerPath(id: string, path: string): Promise<ContainerFile[]> {
  const res = await execGet("ls", id, path);
  if (res.status === 501) throw new DockerUnavailableError();
  if (res.status === 422) throw new ContainerPathError(path);
  if (!res.ok) throw new Error(`ls failed: ${res.status}`);
  return ((await res.json()) as { entries?: ContainerFile[] }).entries ?? [];
}

/** TASK-1875 — read a file inside a running container. */
export async function readContainerFile(id: string, path: string): Promise<string> {
  const res = await execGet("cat", id, path);
  if (res.status === 501) throw new DockerUnavailableError();
  if (res.status === 422) throw new ContainerPathError(path);
  if (res.status === 413) throw new ContainerFileUnreadable("too-large");
  if (res.status === 415) throw new ContainerFileUnreadable("not-text");
  if (!res.ok) throw new Error(`cat failed: ${res.status}`);
  return ((await res.json()) as { text?: string }).text ?? "";
}

// ---------------------------------------------------------------------------
// TASK-1966 — meeting recordings (adapter routes from choda-deck TASK-1965).
// ---------------------------------------------------------------------------

/** The two streams a meeting records. Stored as separate files, never mixed. */
export type MeetingTrack = "mic" | "loopback";

/** Mirror of the adapter's meta.json (choda-deck src/adapters/companion/meetings.ts). */
export interface MeetingMeta {
  id: string;
  startedAt: string;
  endedAt: string;
  tracks: MeetingTrack[];
  bytes: number;
  /**
   * TASK-2043 — a human-readable subject line, generated from the transcript and
   * editable by hand. Absent on every meeting recorded before the field existed
   * and null whenever generation was skipped or declined; both read the same to
   * the UI, which falls back to the start timestamp.
   */
  title?: string | null;
  /** TASK-1993 — when transcript.json was last written; null/absent until transcribed. */
  transcribedAt?: string | null;
  /**
   * TASK-2003 — when the audio was deliberately deleted to reclaim disk. The
   * meeting survives it: `tracks` still says what was recorded, and the
   * transcript is still readable. Absent on an adapter that predates the route,
   * which reads the same as "audio still there" — the safe default, since that
   * adapter cannot have deleted any.
   */
  audioDeletedAt?: string | null;
}

/** Mirror of choda-deck TASK-1991's transcript.json segment. */
export interface TranscriptSegment {
  track: MeetingTrack;
  speaker: "Me" | "Them";
  startMs: number;
  endMs: number;
  text: string;
  locale: string | null;
}

export interface MeetingTranscript {
  meetingId: string;
  createdAt: string;
  segments: TranscriptSegment[];
}

/**
 * Why a transcription did not happen. Three different facts, kept apart because
 * each tells the reader to do something different — and none of them means
 * "there is no transcript yet":
 *
 *   * `unconfigured`  (501) — the adapter has no Azure Speech key. Nothing is
 *                     broken; one capability is off.
 *   * `route-missing` (404) — this adapter predates the route (a vendored copy).
 *   * `failed`        (anything else, typically 502) — Azure or the adapter
 *                     failed this time; the recording is untouched and a retry
 *                     is reasonable.
 */
export class TranscribeError extends Error {
  constructor(
    readonly kind: "unconfigured" | "route-missing" | "failed",
    message: string,
  ) {
    super(message);
    this.name = "TranscribeError";
  }
}

export async function transcribeMeeting(id: string): Promise<MeetingTranscript> {
  const res = await fetch(`${API_BASE}/meetings/${encodeURIComponent(id)}/transcribe`, { method: "POST" });
  if (res.status === 501) throw new TranscribeError("unconfigured", "speech not configured");
  if (res.status === 404) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    // The route answering "meeting not found" is a different fact from the route
    // not existing at all, and only the second means a stale adapter.
    if (body?.error === "meeting not found") throw new TranscribeError("failed", "meeting not found");
    throw new TranscribeError("route-missing", "transcribe route not present on this adapter");
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string; detail?: string } | null;
    throw new TranscribeError("failed", body?.detail ?? body?.error ?? `transcribe failed: ${res.status}`);
  }
  return (await res.json()) as MeetingTranscript;
}

/** A transcript already on disk, read back through the artifacts byte route. */
export async function fetchTranscript(id: string, signal?: AbortSignal): Promise<MeetingTranscript> {
  const res = await fetch(`${API_BASE}/artifacts/meetings/${encodeURIComponent(id)}/transcript.json`, { signal });
  if (!res.ok) throw new Error(`transcript read failed: ${res.status}`);
  return (await res.json()) as MeetingTranscript;
}

/**
 * `GET /meetings` answered 404 — the route does not exist on this adapter.
 *
 * Not an error in the ordinary sense: the shipped app carries a VENDORED copy of
 * the adapter, and a route added after that copy was taken 404s until
 * `pnpm run vendor:adapter` runs and a release goes out. The view renders this as
 * a capability note naming the stale adapter, because "you have no recordings"
 * and "this build cannot store recordings" must never look the same.
 */
export class MeetingsRouteMissingError extends Error {
  constructor() {
    super("meetings route not present on this adapter");
    this.name = "MeetingsRouteMissingError";
  }
}

export async function fetchMeetings(signal?: AbortSignal): Promise<MeetingMeta[]> {
  const res = await fetch(`${API_BASE}/meetings`, { signal });
  if (res.status === 404) throw new MeetingsRouteMissingError();
  if (!res.ok) throw new Error(`meetings listing failed: ${res.status}`);
  return (await res.json()) as MeetingMeta[];
}

/**
 * One timeslice of one track. The adapter refuses anything but `last + 1` with
 * 409, so callers MUST send a track's chunks strictly in order — see the upload
 * queue in RecorderProvider, which serialises them per track.
 */
export async function postMeetingChunk(
  id: string,
  track: MeetingTrack,
  seq: number,
  chunk: Blob,
): Promise<void> {
  const res = await fetch(
    `${API_BASE}/meetings/${encodeURIComponent(id)}/chunk?track=${track}&seq=${seq}`,
    { method: "POST", headers: { "content-type": "audio/webm" }, body: chunk },
  );
  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(detail?.error ?? `chunk ${track}#${seq} failed: ${res.status}`);
  }
}

export async function finalizeMeeting(
  id: string,
  times: { startedAt: string; endedAt: string },
): Promise<MeetingMeta> {
  const res = await fetch(`${API_BASE}/meetings/${encodeURIComponent(id)}/finalize`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(times),
  });
  if (!res.ok) throw new Error(`finalize failed: ${res.status}`);
  return (await res.json()) as MeetingMeta;
}

/** Playback goes through the existing artifacts byte route, which serves audio/webm. */
export function meetingAudioUrl(id: string, track: MeetingTrack): string {
  return `${API_BASE}/artifacts/meetings/${encodeURIComponent(id)}/${track}.webm`;
}

// ---------------------------------------------------------------------------
// TASK-1994 — save a meeting's transcript and note; draft the note (choda-deck
// TASK-1992 / TASK-1994 adapter routes).
// ---------------------------------------------------------------------------

export type MeetingFileName = "transcript.md" | "note.md";

export interface SaveMeetingFilesRequest {
  projectId: string | null;
  workspaceId: string | null;
  date: string;
  slug: string;
  files: Array<{ name: MeetingFileName; markdown: string }>;
  alsoRepo: boolean;
  keepOutOfGit: boolean;
}

export async function saveMeetingFiles(id: string, body: SaveMeetingFilesRequest): Promise<{ written: string[] }> {
  const res = await fetch(`${API_BASE}/meetings/${encodeURIComponent(id)}/files`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as { written?: string[]; error?: string; path?: string } | null;
  if (res.status === 409) throw new Error(`Already saved: ${json?.path ?? "a file with this name exists"}`);
  if (!res.ok) throw new Error(json?.error ?? `save failed: ${res.status}`);
  return { written: json?.written ?? [] };
}

export interface NotePart {
  fromMs: number;
  toMs: number;
  kind: "client" | "internal";
}

export interface GlossaryEntry {
  heard: string[];
  term: string;
}

export interface DraftNoteRequest {
  client: string;
  project: string | null;
  topic?: string;
  attendees?: string[];
  language: "vi" | "en";
  parts?: NotePart[];
  includeInternal: boolean;
  glossary?: GlossaryEntry[];
  /** TASK-2004 — which deployment drafts it. Absent means the configured one. */
  model?: string;
}

export interface DroppedNoteItem {
  section: string;
  text: string;
  atMs: number | null;
  reason: "no-timestamp" | "outside-segments" | "internal-part";
}

/**
 * One row of the note's "Việc cần làm" table. The draft route keeps these
 * structured beside the rendered markdown (TASK-1992), so TASK-1995's inbox
 * send reads `atMs` from the row rather than parsing `▶ mm:ss` back out of the
 * markdown — a parse that would break the moment the heading is translated.
 */
export interface NoteAction {
  text: string;
  atMs: number;
  owner: string;
  due: string | null;
}

export interface DraftNoteResponse {
  markdown: string;
  dropped: DroppedNoteItem[];
  note?: { actions?: NoteAction[] };
  /** The deployment that actually answered — the picked one, or the fallback. */
  usedModel?: string;
}

export async function draftMeetingNote(id: string, body: DraftNoteRequest): Promise<DraftNoteResponse> {
  const res = await fetch(`${API_BASE}/meetings/${encodeURIComponent(id)}/note/draft`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as (DraftNoteResponse & { error?: string; kind?: string }) | null;
  if (res.status === 501) throw new Error("No AI model is configured on this adapter, so it cannot draft a note.");
  if (!res.ok || !json) throw new Error(json?.error ? `${json.error}${json.kind ? ` (${json.kind})` : ""}` : `draft failed: ${res.status}`);
  return {
    markdown: json.markdown,
    dropped: json.dropped ?? [],
    note: json.note ?? {},
    ...(json.usedModel ? { usedModel: json.usedModel } : {}),
  };
}
