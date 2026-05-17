import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { Markdown } from "../components/Markdown";
import { api } from "../api";
import { relativeTime } from "../utils";

export function InboxDetail() {
  const { id = "" } = useParams<{ id: string }>();
  const { data, isLoading, error } = useQuery({
    queryKey: ["inbox", id],
    queryFn: () => api.getInbox(id),
    enabled: !!id,
  });

  return (
    <div>
      <p className="mb-3">
        <Link to="/inbox" className="text-[13px] text-zinc-500 hover:underline">
          <i className="ti ti-arrow-left mr-1" aria-hidden="true" /> Inbox
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
          <h1 className="text-[18px] mb-1">
            <span className="mono text-[13px] text-zinc-500">{data.id}</span>
            <span className="ml-2 text-[12px] text-zinc-500">{data.status}</span>
            <span className="ml-2 text-[12px] text-zinc-400">
              {relativeTime(data.updated_at)}
            </span>
          </h1>
          <Markdown source={data.content} />
        </>
      )}
    </div>
  );
}
