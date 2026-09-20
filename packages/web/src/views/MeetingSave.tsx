// TASK-1994 — turn a transcribed meeting into saved files.
//
// Butter's decision (2026-09-17): pick the project/workspace on the meeting,
// save the transcript, then draft a note, review it, and save it. Both files
// always go to the vault; a copy into the workspace's repo is opt-in, and when
// it is on, "keep out of git" defaults on too — this is client content.
//
// Two things are deliberate and tested:
//
//   * Nothing is written without a press of Save. Drafting only returns text; the
//     editor holds it; only Save sends the PUT, with whatever the editor holds.
//   * The model never names the client. Client is a required field here, because
//     the transcript of the first real call never said the client's name at all.
//
// A meeting can turn into an internal conversation halfway (it did, on that same
// call), so a draft can be split into parts at the current playback position,
// and internal parts stay out of the note unless asked for.

import { useEffect, useMemo, useState } from "react";
import type {
  DraftNoteResponse,
  NoteAction,
  GlossaryEntry,
  MeetingMeta,
  NotePart,
  Project,
  TranscriptSegment,
  Workspace,
} from "../api";
import {
  draftMeetingNote,
  fetchProjects,
  fetchReviewModels,
  fetchWorkspaces,
  saveMeetingFiles,
  sendTextToInbox,
} from "../api";
import { ErrorState } from "../components/state/ErrorState";
import { FullscreenOverlay } from "../components/FullscreenOverlay";
import { CaptureMarkdown } from "../components/CaptureMarkdown";

const GLOSSARY_KEY = (projectId: string): string => `choda.meeting-glossary.${projectId}`;
// TASK-2004 — the model is remembered per project for the same reason the
// glossary is: which deployment reads a client's meetings well is a property of
// that client's vocabulary, not of this laptop.
const MODEL_KEY = (projectId: string): string => `choda.meeting-model.${projectId}`;

/**
 * `mm:ss`, or `h:mm:ss` from one hour on — the format the note's own ▶ links
 * use. Deliberately a copy of MeetingRow's `formatAt` rather than an import:
 * MeetingRow already imports this module, and importing back would close a
 * cycle for four lines of arithmetic.
 */
function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number): string => String(n).padStart(2, "0");
  const h = Math.floor(total / 3600);
  return h > 0
    ? `${h}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`
    : `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

/** `hh:mm:ss`, the transcript file's own timestamp format. */
function stamp(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

export function renderTranscriptMarkdown(meeting: MeetingMeta, client: string, segments: TranscriptSegment[]): string {
  const lines = [`# Transcript — ${client || "meeting"} — ${meeting.startedAt.slice(0, 10)}`, "", `Recording: ${meeting.id}`, ""];
  for (const s of segments) lines.push(`[${stamp(s.startMs)}] ${s.speaker}: ${s.text}`);
  return lines.join("\n") + "\n";
}

/** Lower-case ASCII slug; Vietnamese diacritics folded ("Chị Kate" → "chi-kate"). */
/**
 * TASK-2047 — where a save will land, said BEFORE the save rather than after it.
 *
 * This mirrors the adapter's rule (`meeting-files.ts:154-157`) rather than asking
 * for it, because the rule is fixed and a round trip to learn it would be a route
 * that exists only to restate a constant.
 *
 * The vault half is VAULT-RELATIVE on purpose. `vaultDir` reaches the adapter's
 * route handlers and is never put in a response body, so the client genuinely does
 * not know the absolute root; showing one would mean hard-coding a path that is
 * correct on exactly one machine. The absolute paths arrive the moment they are
 * real — `PUT /meetings/:id/files` answers with them — and the UI switches to
 * those after a save. The repo copy is the exception: its root is the workspace
 * cwd, which the client already has, so it is absolute in both phases.
 */
export const VAULT_PROJECTS_DIR = "10-Projects";
/** The adapter's own fallback when no project is chosen (meeting-files.ts:157). */
export const NO_PROJECT_FOLDER = "_meetings";

export interface SaveDestination {
  /** "vault" is relative to the vault root; "repo" is absolute. */
  kind: "vault" | "repo";
  path: string;
}

export function saveDestinations(opts: {
  projectId: string | null;
  date: string;
  slug: string;
  alsoRepo: boolean;
  workspaceCwd: string | null;
}): SaveDestination[] {
  const folder = `${opts.date}-${opts.slug}`;
  const out: SaveDestination[] = [
    {
      kind: "vault",
      path: ["vault", VAULT_PROJECTS_DIR, opts.projectId ?? NO_PROJECT_FOLDER, "meetings", folder].join("/")
    }
  ];
  // Only when a workspace is actually known. `alsoRepo` is disabled without one,
  // but a destination list that quietly showed "null/docs/meetings" on the way
  // there would be worse than showing one destination.
  if (opts.alsoRepo && opts.workspaceCwd) {
    out.push({ kind: "repo", path: `${opts.workspaceCwd.replace(/[\/]+$/, "")}/docs/meetings/${folder}` });
  }
  return out;
}

export function slugify(text: string): string {
  const s = text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return s || "meeting";
}

function localDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function readStored(key: (p: string) => string, projectId: string | null): string {
  if (!projectId) return "";
  try {
    return localStorage.getItem(key(projectId)) ?? "";
  } catch {
    return "";
  }
}

function writeStored(key: (p: string) => string, projectId: string | null, value: string): void {
  if (!projectId) return;
  try {
    localStorage.setItem(key(projectId), value);
  } catch {
    /* storage unavailable — the choice still applies to this draft */
  }
}

function readGlossary(projectId: string | null): string {
  if (!projectId) return "";
  try {
    return localStorage.getItem(GLOSSARY_KEY(projectId)) ?? "";
  } catch {
    return "";
  }
}

function writeGlossary(projectId: string | null, text: string): void {
  if (!projectId) return;
  try {
    localStorage.setItem(GLOSSARY_KEY(projectId), text);
  } catch {
    /* storage unavailable — the glossary still applies to this draft */
  }
}

/** One row per line: `heard, heard → term`. Lines without an arrow are ignored. */
export function parseGlossary(text: string): GlossaryEntry[] {
  const out: GlossaryEntry[] = [];
  for (const line of text.split(/\r?\n/)) {
    const [heard, term, extra] = line.split(/→|->/);
    if (heard === undefined || term === undefined || extra !== undefined || !term.trim()) continue;
    const forms = heard.split(",").map((h) => h.trim()).filter(Boolean);
    if (forms.length > 0) out.push({ heard: forms, term: term.trim() });
  }
  return out;
}

/** "mantu::abcv2" / "mantu::" — the picker's value encodes both ids. */
function splitChoice(value: string): { projectId: string | null; workspaceId: string | null } {
  if (!value) return { projectId: null, workspaceId: null };
  const [p, w] = value.split("::");
  return { projectId: p || null, workspaceId: w || null };
}

const input =
  "rounded-md border border-zinc-200 dark:border-zinc-700 bg-transparent px-2 py-1 text-xs text-zinc-800 dark:text-zinc-200";
const button =
  "flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50";

export function MeetingSave({
  meeting,
  segments,
  currentMs,
}: {
  meeting: MeetingMeta;
  segments: TranscriptSegment[];
  /** Playback position of the row's players, for "split here". */
  currentMs: () => number;
}): React.JSX.Element {
  const [projects, setProjects] = useState<Project[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [choice, setChoice] = useState("");
  const [client, setClient] = useState("");
  const [topic, setTopic] = useState("");
  const [alsoRepo, setAlsoRepo] = useState(false);
  const [keepOutOfGit, setKeepOutOfGit] = useState(true);
  const [language, setLanguage] = useState<"vi" | "en">("vi");
  const [splits, setSplits] = useState<Array<{ atMs: number; internalAfter: boolean }>>([]);
  const [includeInternal, setIncludeInternal] = useState(false);
  const [glossary, setGlossary] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState("");
  const [draft, setDraft] = useState<DraftNoteResponse | null>(null);
  // TASK-2045 — the note draft, rendered as markdown at full window size.
  const [previewing, setPreviewing] = useState(false);
  // TASK-2047 — the absolute paths the adapter reported. Kept apart from
  // `message` because a status line is cleared by the next action, while where
  // the files went stays true until different files are written.
  const [written, setWritten] = useState<string[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  // TASK-1995 — which action rows have already been sent, by index. An action
  // sent twice is two inbox rows for one piece of work, and nothing downstream
  // can tell them apart, so a sent row's button is disabled rather than merely
  // discouraged.
  const [sent, setSent] = useState<Record<number, true>>({});
  const [sending, setSending] = useState<number | null>(null);
  const [busy, setBusy] = useState<null | "transcript" | "draft" | "note">(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    Promise.all([fetchProjects(ctrl.signal), fetchWorkspaces(ctrl.signal)])
      .then(([p, w]) => {
        setProjects(p.projects);
        setWorkspaces(w.workspaces.filter((ws) => !ws.archivedAt));
      })
      .catch(() => {
        /* the picker then offers "No project" only; saving still works */
      });
    return () => ctrl.abort();
  }, []);

  const { projectId, workspaceId } = splitChoice(choice);

  // TASK-2047 — built from the same inputs the save will send, so the preview
  // cannot name a destination the request would not use.
  const destinations = saveDestinations({
    projectId,
    date: localDate(meeting.startedAt),
    slug: slugify(client || topic || meeting.id),
    alsoRepo,
    workspaceCwd: workspaces.find((w) => w.id === workspaceId)?.cwd ?? null
  });

  // The glossary belongs to the project: typed once, reused for every meeting in it.
  useEffect(() => {
    setGlossary(readGlossary(projectId));
    setModel(readStored(MODEL_KEY, projectId));
  }, [projectId]);

  // The same list AI review offers. It reaches no provider, so it is safe on mount.
  useEffect(() => {
    const ctrl = new AbortController();
    fetchReviewModels(ctrl.signal)
      .then((r) => setModels(r.models.map((m) => m.id)))
      .catch(() => {
        /* no catalog — the select then offers the configured default only */
      });
    return () => ctrl.abort();
  }, []);

  const options = useMemo(
    () =>
      projects.flatMap((p) => [
        { value: `${p.id}::`, label: p.name || p.id },
        ...workspaces
          .filter((w) => w.projectId === p.id)
          .map((w) => ({ value: `${p.id}::${w.id}`, label: `${p.name || p.id} · ${w.label}` })),
      ]),
    [projects, workspaces],
  );

  const endMs = Math.max(0, new Date(meeting.endedAt).getTime() - new Date(meeting.startedAt).getTime());

  function parts(): NotePart[] | undefined {
    if (splits.length === 0) return undefined;
    const sorted = [...splits].sort((a, b) => a.atMs - b.atMs);
    const out: NotePart[] = [];
    let from = 0;
    let kind: NotePart["kind"] = "client";
    for (const s of sorted) {
      if (s.atMs > from) out.push({ fromMs: from, toMs: s.atMs, kind });
      from = s.atMs;
      kind = s.internalAfter ? "internal" : "client";
    }
    out.push({ fromMs: from, toMs: Math.max(endMs, from + 1), kind });
    return out;
  }

  async function copyPath(text: string, key: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    } catch {
      // A denied clipboard must not look like a successful copy. The path is
      // selectable text either way, so the user can still take it by hand.
      setCopied(null);
    }
  }

  async function save(name: "transcript.md" | "note.md", markdown: string): Promise<void> {
    setError(null);
    setMessage(null);
    setBusy(name === "note.md" ? "note" : "transcript");
    try {
      const { written } = await saveMeetingFiles(meeting.id, {
        projectId,
        workspaceId,
        date: localDate(meeting.startedAt),
        slug: slugify(client || topic || meeting.id),
        files: [{ name, markdown }],
        alsoRepo,
        keepOutOfGit,
      });
      setWritten(written);
      setMessage(`Saved ${written.length} file${written.length === 1 ? "" : "s"}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function makeDraft(): Promise<void> {
    setError(null);
    setMessage(null);
    setBusy("draft");
    writeGlossary(projectId, glossary);
    writeStored(MODEL_KEY, projectId, model);
    try {
      const entries = parseGlossary(glossary);
      const result = await draftMeetingNote(meeting.id, {
        client: client.trim(),
        project: projectId,
        ...(topic.trim() ? { topic: topic.trim() } : {}),
        language,
        ...(parts() ? { parts: parts() } : {}),
        includeInternal,
        ...(entries.length ? { glossary: entries } : {}),
        ...(model ? { model } : {}),
      });
      setDraft(result);
      setSent({});
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  // The inbox row must lead back to the evidence, so it carries the meeting and
  // the moment the action was said — the same ▶ stamp the note itself prints.
  async function sendAction(index: number, action: NoteAction): Promise<void> {
    if (sent[index] || !projectId) return;
    setError(null);
    setSending(index);
    try {
      await sendTextToInbox({
        text: `${action.text} — from meeting ${meeting.id} ▶ ${clock(action.atMs)}`,
        projectId,
      });
      setSent((all) => ({ ...all, [index]: true }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(null);
    }
  }

  const actions = draft?.note?.actions ?? [];
  const canSave = client.trim().length > 0 && busy === null;

  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-zinc-100 dark:border-zinc-800 pt-3" data-testid="meeting-save">
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Project or workspace"
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
          className={input}
        >
          <option value="">No project</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <input aria-label="Client" placeholder="Client (required)" value={client} onChange={(e) => setClient(e.target.value)} className={input} />
        <input aria-label="Topic" placeholder="Topic" value={topic} onChange={(e) => setTopic(e.target.value)} className={input} />
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-600 dark:text-zinc-300">
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            aria-label="Also save to repo"
            checked={alsoRepo}
            disabled={!workspaceId}
            onChange={(e) => setAlsoRepo(e.target.checked)}
          />
          Also save to repo (docs/meetings)
        </label>
        {alsoRepo && (
          <label className="flex items-center gap-1.5">
            <input type="checkbox" aria-label="Keep out of git" checked={keepOutOfGit} onChange={(e) => setKeepOutOfGit(e.target.checked)} />
            Keep out of git
          </label>
        )}
        <button
          type="button"
          className={`${button} ml-auto`}
          disabled={!canSave}
          onClick={() => void save("transcript.md", renderTranscriptMarkdown(meeting, client.trim(), segments))}
        >
          <i className="ti ti-device-floppy" aria-hidden="true" />
          Save transcript
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-600 dark:text-zinc-300">
        <label className="flex items-center gap-1.5">
          Note language
          <select aria-label="Note language" value={language} onChange={(e) => setLanguage(e.target.value as "vi" | "en")} className={input}>
            <option value="vi">Tiếng Việt</option>
            <option value="en">English</option>
          </select>
        </label>
        <button
          type="button"
          className={button}
          onClick={() => setSplits((s) => [...s, { atMs: Math.round(currentMs()), internalAfter: true }])}
        >
          <i className="ti ti-separator" aria-hidden="true" />
          Split at current playback
        </button>
        {splits.length > 0 && (
          <label className="flex items-center gap-1.5">
            <input type="checkbox" aria-label="Include internal parts" checked={includeInternal} onChange={(e) => setIncludeInternal(e.target.checked)} />
            Include internal parts
          </label>
        )}
      </div>
      {splits.length > 0 && (
        <ul className="text-xs text-zinc-500 flex flex-col gap-1" data-testid="note-splits">
          {splits.map((s, i) => (
            <li key={i} className="flex items-center gap-2">
              From {stamp(s.atMs)} on:
              <select
                aria-label={`Part after ${stamp(s.atMs)}`}
                value={s.internalAfter ? "internal" : "client"}
                onChange={(e) =>
                  setSplits((all) => all.map((x, j) => (j === i ? { ...x, internalAfter: e.target.value === "internal" } : x)))
                }
                className={input}
              >
                <option value="internal">internal</option>
                <option value="client">client</option>
              </select>
              <button type="button" className="text-zinc-400 hover:text-zinc-700" onClick={() => setSplits((all) => all.filter((_, j) => j !== i))}>
                remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <label className="flex flex-col gap-1 text-xs text-zinc-500">
        Glossary — one per line, e.g. <code>comparency, confessency → competency</code>
        <textarea aria-label="Glossary" rows={2} value={glossary} onChange={(e) => setGlossary(e.target.value)} className={input} />
      </label>

      <div className="flex items-center gap-2">
        <select
          aria-label="Model"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className={input}
        >
          <option value="">Configured default</option>
          {models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <button type="button" className={button} disabled={!canSave} onClick={() => void makeDraft()}>
          <i className="ti ti-sparkles" aria-hidden="true" />
          {busy === "draft" ? "Drafting…" : "Draft note"}
        </button>
      </div>

      {error && <ErrorState variant="failed" subject="Meeting files" description={error} />}
      {message && <p className="text-xs text-zinc-500" data-testid="save-message">{message}</p>}

      {/* TASK-2047 — where this will go, said before the button is pressed. Once
          files exist, their real absolute paths replace the prediction. */}
      <div className="flex flex-col gap-1" data-testid="destinations">
        <p className="text-[11px] uppercase tracking-wide text-zinc-400">
          {written.length > 0 ? "Saved to" : "Will be saved to"}
        </p>
        {(written.length > 0
          ? written.map((path) => ({ kind: "saved" as const, path }))
          : destinations
        ).map((d) => (
          <div key={`${d.kind}-${d.path}`} className="flex items-center gap-2 min-w-0">
            <span className="text-[11px] text-zinc-400 flex-none w-11">
              {d.kind === "repo" ? "repo" : d.kind === "saved" ? "" : "vault"}
            </span>
            <span
              className="font-mono text-[11.5px] text-zinc-500 truncate"
              title={d.path}
              data-testid={`destination-${d.kind}`}
            >
              {d.path}
            </span>
            <button
              type="button"
              onClick={() => void copyPath(d.path, d.path)}
              className="flex-none text-[11.5px] text-blue-600 dark:text-blue-400 hover:underline"
              aria-label={`Copy path ${d.path}`}
            >
              {copied === d.path ? "Copied" : "Copy path"}
            </button>
          </div>
        ))}
      </div>

      {draft && (
        <div className="flex flex-col gap-2 md:flex-row" data-testid="note-draft">
          <div className="flex-1 flex flex-col gap-1">
            {/* TASK-2045 — the note is markdown and had never been rendered as
                any. The textarea stays the ONLY editor; this is a reading view
                of what is in it right now. */}
            <button
              type="button"
              onClick={() => setPreviewing(true)}
              className="self-start text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
              data-testid="note-preview-open"
            >
              <i className="ti ti-arrows-maximize mr-1" aria-hidden="true" />
              Preview full screen
            </button>
            <textarea
              aria-label="Note draft"
              value={draft.markdown}
              onChange={(e) => setDraft({ ...draft, markdown: e.target.value })}
              rows={16}
              className={`${input} flex-1 font-mono`}
            />
          </div>
          {previewing && (
            <FullscreenOverlay
              title="Note preview"
              onClose={() => setPreviewing(false)}
              testId="note-preview"
            >
              {/* Read from `draft.markdown`, the same state the textarea binds
                  to, so the preview cannot show a stale copy of the note. */}
              <CaptureMarkdown>{draft.markdown}</CaptureMarkdown>
            </FullscreenOverlay>
          )}
          <div className="md:w-64 flex flex-col gap-1">
            <p className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Không có trong bản ghi — không đưa vào note</p>
            <ul className="text-xs text-zinc-500 flex flex-col gap-1" data-testid="note-dropped">
              {draft.dropped.map((d, i) => (
                <li key={i}>
                  {d.text} <span className="text-zinc-400">({d.reason})</span>
                </li>
              ))}
            </ul>
            {actions.length > 0 && (
              <>
                <p className="mt-2 text-xs font-medium text-zinc-600 dark:text-zinc-300">Việc cần làm</p>
                <ul className="text-xs text-zinc-500 flex flex-col gap-1.5" data-testid="note-actions">
                  {actions.map((a, i) => (
                    <li key={`${a.atMs}-${i}`} className="flex flex-col gap-0.5">
                      <span className="text-zinc-700 dark:text-zinc-200">{a.text}</span>
                      <span className="flex items-center gap-2">
                        <span className="tabular-nums text-zinc-400">▶ {clock(a.atMs)}</span>
                        <button
                          type="button"
                          className={button}
                          disabled={sent[i] === true || sending !== null || !projectId}
                          title={projectId ? undefined : "Pick a project first — the inbox row needs one"}
                          onClick={() => void sendAction(i, a)}
                        >
                          <i className="ti ti-inbox" aria-hidden="true" />
                          {sent[i] ? "Sent" : sending === i ? "Sending…" : "Send to inbox"}
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            <button type="button" className={`${button} mt-2`} disabled={!canSave} onClick={() => void save("note.md", draft.markdown)}>
              <i className="ti ti-device-floppy" aria-hidden="true" />
              Save note
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
