// TASK-2736 — the chat assistant. Chat list on the left, the open chat on the
// right, same split as ConversationsView.
//
// The cost rule (ADR adr-when-this-project-may-call-a-model, 2026-10-24
// amendment) is visible here: nothing calls the model on open, on picking a
// chat or on changing the model. Only Send does, and every reply shows what it
// cost — tool steps and tokens — so a question's price is never hidden.
//
// TASK-2760 — replies stream in. Each tool the assistant runs shows as a chip
// while it works, the text grows as it arrives, and Stop cancels the request
// (the service keeps what arrived, marked interrupted). Replies render as
// markdown with copyable code blocks; the user's own messages stay plain text.

import { useEffect, useRef, useState } from "react";
import {
  AdapterRouteMissingError,
  AssistantBudgetError,
  AssistantProviderError,
  AssistantUnavailableError,
  createAssistantChat,
  fetchAssistantChat,
  fetchAssistantChats,
  fetchAssistantModels,
  sendAssistantMessage,
  type AssistantChatMessage,
  type AssistantChatSummary,
  type AssistantModel,
} from "../api";
import { EmptyState } from "../components/state/EmptyState";
import { AssistantMarkdown } from "../components/AssistantMarkdown";

/** Matches the adapter's MAX_TOOL_STEPS: at this many steps the loop was capped. */
const MAX_TOOL_STEPS = 8;
const WARN_AT = 0.8;
const COPIED_MS = 2000;

interface ToolChip {
  tool: string;
  ok: boolean;
}

interface Turn {
  key: string;
  role: "user" | "assistant";
  content: string;
  tools?: ToolChip[];
  meta?: { steps: number; tokens: number; capped: boolean; estimated: boolean; interrupted: boolean };
}

/** Stored rows → turns. Steps are the tool rows between a question and its reply. */
export function toTurns(messages: AssistantChatMessage[]): Turn[] {
  const turns: Turn[] = [];
  let tools: ToolChip[] = [];
  for (const m of messages) {
    if (m.role === "tool") {
      tools.push({ tool: m.toolName ?? "tool", ok: !(m.content ?? "").startsWith('{"error"') });
      continue;
    }
    if (m.role === "user") {
      tools = [];
      turns.push({ key: m.id, role: "user", content: m.content ?? "" });
      continue;
    }
    turns.push({
      key: m.id,
      role: "assistant",
      content: m.content ?? "",
      tools,
      meta: {
        steps: tools.length,
        tokens: (m.promptTokens ?? 0) + (m.completionTokens ?? 0),
        capped: tools.length >= MAX_TOOL_STEPS,
        estimated: m.tokensEstimated,
        interrupted: m.interrupted === true,
      },
    });
    tools = [];
  }
  return turns;
}

function costLine(meta: NonNullable<Turn["meta"]>): string {
  const parts = [
    `${meta.steps} ${meta.steps === 1 ? "step" : "steps"}`,
    meta.estimated ? "tokens estimated" : `${meta.tokens} tokens`,
  ];
  if (meta.capped) parts.push("capped");
  if (meta.interrupted) parts.push("interrupted");
  return parts.join(" · ");
}

function describeError(err: unknown): string {
  if (err instanceof AdapterRouteMissingError) {
    return "The companion adapter is older than this app — restart it";
  }
  if (err instanceof AssistantUnavailableError) {
    return "The assistant service is not running — restart the companion";
  }
  if (err instanceof AssistantProviderError) {
    if (err.kind === "rate_limit") {
      return err.retryAfter ? `Rate limited, try again in ${err.retryAfter} s` : "Rate limited, try again shortly";
    }
    if (err.kind === "api") return "This model could not answer with tools, pick another model";
    if (err.kind === "budget") return "The model used its whole answer budget — try a narrower question";
    return `The model call failed (${err.kind})`;
  }
  return (err as Error).message;
}

function ToolChips({ tools }: { tools: ToolChip[] }): React.JSX.Element | null {
  if (tools.length === 0) return null;
  return (
    <ul aria-label="Tools used" className="flex flex-wrap gap-1.5">
      {tools.map((t, i) => (
        <li
          key={`${t.tool}-${i}`}
          data-testid="assistant-tool-chip"
          className="inline-flex items-center gap-1 rounded-full border border-zinc-200 px-2 py-0.5 text-xs text-zinc-600 dark:border-zinc-800 dark:text-zinc-300"
        >
          <i
            className={`ti ${t.ok ? "ti-check text-green-700 dark:text-green-400" : "ti-x text-red-700 dark:text-red-400"}`}
            aria-label={t.ok ? "ok" : "failed"}
          />
          {t.tool}
        </li>
      ))}
    </ul>
  );
}

function CopyReply({ text }: { text: string }): React.JSX.Element {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={copied ? "Reply copied" : "Copy reply"}
      title={copied ? "Copied" : "Copy reply"}
      onClick={() => {
        void navigator.clipboard
          .writeText(text)
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), COPIED_MS);
          })
          .catch(() => setCopied(false));
      }}
      className="inline-grid h-7 w-7 place-items-center rounded-md text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
    >
      <i className={`ti ${copied ? "ti-check" : "ti-copy"}`} aria-hidden="true" />
    </button>
  );
}

export function AssistantView(): React.JSX.Element {
  const [models, setModels] = useState<AssistantModel[]>([]);
  const [model, setModel] = useState("");
  const [chats, setChats] = useState<AssistantChatSummary[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [live, setLive] = useState<{ text: string; tools: ToolChip[] } | null>(null);
  const [exhausted, setExhausted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const chat = chats.find((c) => c.id === chatId) ?? null;

  useEffect(() => {
    const ctrl = new AbortController();
    fetchAssistantModels(ctrl.signal)
      .then((r) => {
        setModels(r.models);
        setModel(r.selected);
      })
      .catch((err: unknown) => {
        if ((err as Error).name !== "AbortError") setError(describeError(err));
      });
    fetchAssistantChats(ctrl.signal)
      .then(setChats)
      .catch((err: unknown) => {
        if ((err as Error).name !== "AbortError") setError(describeError(err));
      });
    return () => ctrl.abort();
  }, []);

  async function openChat(id: string): Promise<void> {
    setChatId(id);
    setError(null);
    setTurns([]);
    try {
      const r = await fetchAssistantChat(id);
      setTurns(toTurns(r.messages));
      setExhausted(r.chat.tokensUsed >= r.chat.tokenBudget);
      if (r.chat.model) setModel(r.chat.model);
    } catch (err) {
      setError(describeError(err));
    }
  }

  async function newChat(prefill = ""): Promise<AssistantChatSummary | null> {
    setError(null);
    try {
      const created = await createAssistantChat(model ? { model } : {});
      setChats((cs) => [created, ...cs]);
      setChatId(created.id);
      setTurns([]);
      setExhausted(false);
      setInput(prefill);
      return created;
    } catch (err) {
      setError(describeError(err));
      return null;
    }
  }

  function stop(): void {
    abortRef.current?.abort();
  }

  async function send(): Promise<void> {
    const content = input.trim();
    if (content === "" || sending) return;
    setError(null);
    setSending(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let target: AssistantChatSummary | null = null;
    try {
      target = chat ?? (await newChat());
      if (!target) return;
      setTurns((ts) => [...ts, { key: `pending-${ts.length}`, role: "user", content }]);
      setInput("");
      setLive({ text: "", tools: [] });
      const r = await sendAssistantMessage(target.id, content, model || undefined, {
        signal: ctrl.signal,
        onStep: (s) => setLive((l) => ({ text: l?.text ?? "", tools: [...(l?.tools ?? []), { tool: s.tool, ok: s.ok }] })),
        onDelta: (t) => setLive((l) => ({ text: (l?.text ?? "") + t, tools: l?.tools ?? [] })),
      });
      setTurns((ts) => [
        ...ts,
        {
          key: `reply-${ts.length}`,
          role: "assistant",
          content: r.reply.content,
          tools: r.steps.map((s) => ({ tool: s.tool, ok: s.ok })),
          meta: {
            steps: r.steps.length,
            tokens: r.usage.prompt + r.usage.completion,
            capped: r.capped,
            estimated: r.usage.estimated,
            interrupted: false,
          },
        },
      ]);
      const id = target.id;
      setChats((cs) =>
        cs.map((c) => (c.id === id ? { ...c, tokensUsed: r.chat.tokensUsed, tokenBudget: r.chat.tokenBudget } : c)),
      );
      if (r.chat.tokensUsed >= r.chat.tokenBudget) setExhausted(true);
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        // Stopped: the service stored what arrived as an interrupted reply;
        // reload so the thread shows exactly that.
        if (target) void openChat(target.id);
      } else {
        if (err instanceof AssistantBudgetError) setExhausted(true);
        // The question stays in the box so it can be sent again.
        setInput(content);
        setTurns((ts) => (ts.at(-1)?.key.startsWith("pending-") ? ts.slice(0, -1) : ts));
        setError(err instanceof AssistantBudgetError ? "This chat has used its token budget." : describeError(err));
      }
    } finally {
      abortRef.current = null;
      setLive(null);
      setSending(false);
    }
  }

  const nearBudget = chat !== null && chat.tokenBudget > 0 && chat.tokensUsed / chat.tokenBudget >= WARN_AT;

  return (
    <section aria-label="assistant" className="flex-1 min-h-0 flex flex-col">
      <h1 className="text-lg font-medium mb-4">Assistant</h1>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(240px,300px)_1fr] gap-6 flex-1 min-h-0 lg:grid-rows-[minmax(0,1fr)]">
        <nav aria-label="chats" className="min-h-0 overflow-y-auto flex flex-col gap-1">
          <button
            type="button"
            onClick={() => void newChat()}
            className="mb-2 inline-flex items-center gap-1.5 rounded-md border border-zinc-200 px-2.5 py-1.5 text-sm hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
          >
            <i className="ti ti-plus" aria-hidden="true" />
            New chat
          </button>
          {chats.length === 0 && <p className="text-xs text-zinc-500">No chats yet.</p>}
          {chats.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-current={c.id === chatId ? "true" : undefined}
              onClick={() => void openChat(c.id)}
              className={`text-left rounded-md px-2.5 py-1.5 text-sm ${
                c.id === chatId ? "bg-zinc-100 dark:bg-zinc-800" : "hover:bg-zinc-50 dark:hover:bg-zinc-900"
              }`}
            >
              <span className="block truncate">{c.title}</span>
              <span className="block text-xs text-zinc-500 tabular-nums">
                {c.id} · {c.tokensUsed.toLocaleString()} tokens
              </span>
            </button>
          ))}
        </nav>

        <div className="min-w-0 min-h-0 flex flex-col gap-3">
          <label className="flex items-center gap-2 text-sm text-zinc-500">
            Model
            <select
              aria-label="Model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="rounded-md border border-zinc-200 bg-transparent px-2 py-1 text-sm text-zinc-900 dark:border-zinc-800 dark:text-zinc-100"
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id}
                </option>
              ))}
            </select>
          </label>

          <div data-testid="assistant-thread" className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3">
            {turns.length === 0 && !error && !live && (
              <EmptyState
                icon="ti-message-chatbot"
                title={chat ? "Ask your first question" : "No chat selected"}
                description="Ask anything, or about your tasks, meetings, runs and the vault. The assistant only reads."
              />
            )}
            {turns.map((t) =>
              t.role === "user" ? (
                <div
                  key={t.key}
                  data-testid="assistant-user-turn"
                  className="self-end max-w-[80%] rounded-md bg-zinc-100 px-3 py-2 text-sm dark:bg-zinc-800"
                >
                  <p className="whitespace-pre-wrap">{t.content}</p>
                </div>
              ) : (
                <div key={t.key} data-testid="assistant-reply" className="max-w-[90%] text-sm flex flex-col gap-1.5">
                  <ToolChips tools={t.tools ?? []} />
                  <AssistantMarkdown>{t.content}</AssistantMarkdown>
                  {t.meta && (
                    <div className="flex items-center gap-1">
                      <p data-testid="assistant-cost" className="text-xs text-zinc-500 tabular-nums mr-1">
                        {costLine(t.meta)}
                      </p>
                      <CopyReply text={t.content} />
                    </div>
                  )}
                </div>
              ),
            )}
            {live && (
              <div data-testid="assistant-live" className="max-w-[90%] text-sm flex flex-col gap-1.5">
                <ToolChips tools={live.tools} />
                {live.text !== "" && <AssistantMarkdown>{live.text}</AssistantMarkdown>}
                <p className="text-xs text-zinc-500 tabular-nums">
                  {`Writing… · ${live.tools.length} ${live.tools.length === 1 ? "step" : "steps"} so far`}
                </p>
              </div>
            )}
          </div>

          {nearBudget && chat && (
            <p data-testid="assistant-budget-warning" className="text-xs text-amber-700 dark:text-amber-400 tabular-nums">
              {chat.tokensUsed.toLocaleString()} / {chat.tokenBudget.toLocaleString()} tokens used in this chat
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-red-700 dark:text-red-400">
              {error}
            </p>
          )}
          {exhausted && chatId && (
            <button
              type="button"
              onClick={() => void newChat(`Continue from ${chatId}: `)}
              className="self-start inline-flex items-center gap-1.5 rounded-md border border-zinc-200 px-2.5 py-1.5 text-sm hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
            >
              <i className="ti ti-arrow-forward" aria-hidden="true" />
              New chat from this one
            </button>
          )}

          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <textarea
              aria-label="Message"
              value={input}
              disabled={sending || exhausted}
              onChange={(e) => setInput(e.target.value)}
              rows={2}
              placeholder="Ask anything, or about your work data…"
              className="flex-1 rounded-md border border-zinc-200 bg-transparent px-2.5 py-1.5 text-sm disabled:opacity-50 dark:border-zinc-800"
            />
            {sending ? (
              <button
                type="button"
                onClick={stop}
                className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
              >
                <i className="ti ti-player-stop" aria-hidden="true" />
                Stop
              </button>
            ) : (
              <button
                type="submit"
                disabled={exhausted || input.trim() === ""}
                className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
              >
                Send
              </button>
            )}
          </form>
        </div>
      </div>
    </section>
  );
}
