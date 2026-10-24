// TASK-2736 — the chat assistant. Chat list on the left, the open chat on the
// right, same split as ConversationsView.
//
// The cost rule (ADR adr-when-this-project-may-call-a-model, 2026-10-24
// amendment) is visible here: nothing calls the model on open, on picking a
// chat or on changing the model. Only Send does, and every reply shows what it
// cost — tool steps and tokens — so a question's price is never hidden.

import { useEffect, useState } from "react";
import {
  AdapterRouteMissingError,
  AssistantBudgetError,
  AssistantProviderError,
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

/** Matches the adapter's MAX_TOOL_STEPS: at this many steps the loop was capped. */
const MAX_TOOL_STEPS = 8;
const WARN_AT = 0.8;

interface Turn {
  key: string;
  role: "user" | "assistant";
  content: string;
  meta?: { steps: number; tokens: number; capped: boolean; estimated: boolean };
}

/** Stored rows → turns. Steps are the tool rows between a question and its reply. */
export function toTurns(messages: AssistantChatMessage[]): Turn[] {
  const turns: Turn[] = [];
  let steps = 0;
  for (const m of messages) {
    if (m.role === "tool") {
      steps++;
      continue;
    }
    if (m.role === "user") {
      steps = 0;
      turns.push({ key: m.id, role: "user", content: m.content ?? "" });
      continue;
    }
    turns.push({
      key: m.id,
      role: "assistant",
      content: m.content ?? "",
      meta: {
        steps,
        tokens: (m.promptTokens ?? 0) + (m.completionTokens ?? 0),
        capped: steps >= MAX_TOOL_STEPS,
        estimated: m.tokensEstimated,
      },
    });
    steps = 0;
  }
  return turns;
}

function costLine(meta: NonNullable<Turn["meta"]>): string {
  const parts = [
    `${meta.steps} ${meta.steps === 1 ? "step" : "steps"}`,
    meta.estimated ? "tokens estimated" : `${meta.tokens} tokens`,
  ];
  if (meta.capped) parts.push("capped");
  return parts.join(" · ");
}

function describeError(err: unknown): string {
  if (err instanceof AdapterRouteMissingError) {
    return "The companion adapter is older than this app — restart it";
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

export function AssistantView(): React.JSX.Element {
  const [models, setModels] = useState<AssistantModel[]>([]);
  const [model, setModel] = useState("");
  const [chats, setChats] = useState<AssistantChatSummary[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function send(): Promise<void> {
    const content = input.trim();
    if (content === "" || sending) return;
    setError(null);
    setSending(true);
    try {
      const target = chat ?? (await newChat());
      if (!target) return;
      setTurns((ts) => [...ts, { key: `pending-${ts.length}`, role: "user", content }]);
      setInput("");
      const r = await sendAssistantMessage(target.id, content, model || undefined);
      setTurns((ts) => [
        ...ts,
        {
          key: `reply-${ts.length}`,
          role: "assistant",
          content: r.reply.content,
          meta: {
            steps: r.steps.length,
            tokens: r.usage.prompt + r.usage.completion,
            capped: r.capped,
            estimated: r.usage.estimated,
          },
        },
      ]);
      setChats((cs) =>
        cs.map((c) => (c.id === target.id ? { ...c, tokensUsed: r.chat.tokensUsed, tokenBudget: r.chat.tokenBudget } : c)),
      );
      if (r.chat.tokensUsed >= r.chat.tokenBudget) setExhausted(true);
    } catch (err) {
      if (err instanceof AssistantBudgetError) setExhausted(true);
      setError(err instanceof AssistantBudgetError ? "This chat has used its token budget." : describeError(err));
    } finally {
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
            {turns.length === 0 && !error && (
              <EmptyState
                icon="ti-message-chatbot"
                title={chat ? "Ask your first question" : "No chat selected"}
                description="Ask about tasks, meetings, runs, the vault or earlier chats. The assistant only reads."
              />
            )}
            {turns.map((t) => (
              <div
                key={t.key}
                className={
                  t.role === "user"
                    ? "self-end max-w-[80%] rounded-md bg-zinc-100 px-3 py-2 text-sm dark:bg-zinc-800"
                    : "max-w-[90%] text-sm"
                }
              >
                <p className="whitespace-pre-wrap">{t.content}</p>
                {t.meta && (
                  <p data-testid="assistant-cost" className="mt-1 text-xs text-zinc-500 tabular-nums">
                    {costLine(t.meta)}
                  </p>
                )}
              </div>
            ))}
            {sending && <p className="text-xs text-zinc-500">Working…</p>}
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
              placeholder="Ask about your work data…"
              className="flex-1 rounded-md border border-zinc-200 bg-transparent px-2.5 py-1.5 text-sm disabled:opacity-50 dark:border-zinc-800"
            />
            <button
              type="submit"
              disabled={sending || exhausted || input.trim() === ""}
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
