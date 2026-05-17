import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { Markdown } from "../components/Markdown";
import { api } from "../api";

interface MessageLike {
  id?: string;
  author?: string;
  content?: string;
  body?: string;
  type?: string;
  created_at?: string;
  [k: string]: unknown;
}

export function ConversationDetail() {
  const { id = "" } = useParams<{ id: string }>();
  const { data, isLoading, error } = useQuery({
    queryKey: ["conversation", id],
    queryFn: () => api.getConversation(id),
    enabled: !!id,
  });

  return (
    <div>
      <p className="mb-3">
        <Link to="/conversations" className="text-[13px] text-zinc-500 hover:underline">
          <i className="ti ti-arrow-left mr-1" aria-hidden="true" /> Conversations
        </Link>
      </p>
      {isLoading && <p className="text-zinc-500 text-sm">Loading…</p>}
      {error && (
        <p className="text-red-600 dark:text-red-400 text-sm">
          {(error as Error).message}
        </p>
      )}
      {data && (
        <>
          <h1 className="text-[20px] mb-1">{data.conversation.title ?? data.conversation.id}</h1>
          <p className="text-[12px] mb-4">
            <span className="mono text-zinc-500">{data.conversation.id}</span>
            <span className="ml-2 text-zinc-500">{data.conversation.status}</span>
          </p>
          {data.conversation.decision_summary && (
            <section className="mb-4 border-l-2 border-blue-500 pl-3">
              <h2 className="text-[14px] text-blue-700 dark:text-blue-300 font-medium">Decision</h2>
              <Markdown source={data.conversation.decision_summary} />
            </section>
          )}
          <ol className="space-y-4">
            {(data.messages as MessageLike[]).map((m, idx) => (
              <li key={m.id ?? idx} className="border border-zinc-200 dark:border-zinc-700 rounded p-3">
                <div className="flex items-center gap-2 text-[12px] mb-1">
                  <span className="font-medium">{m.author ?? "?"}</span>
                  {m.type && <span className="text-zinc-500">· {m.type}</span>}
                  <span className="ml-auto text-zinc-400">{m.created_at ?? ""}</span>
                </div>
                <Markdown source={String(m.content ?? m.body ?? "")} />
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
