// TASK-2381 — "Cần anh quyết": everything an automated source filed that is
// still waiting on Butter, in one place, with the decision next to it.
//
// Why it exists: in three weeks the daily digest filed 15 ideas into a raw
// inbox of 417 items and 13 of them were never seen — the companion had no
// inbox screen at all (2026-10-11). Butter's requirement for this screen is
// that daily-digest items be the most visible thing in the app, so they come
// FIRST, as their own block, above everything else; the screen is also the
// first sidebar entry and the landing page when something is pending.

import { useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import type { PendingItem } from "../api";
import type { HealthView } from "../hooks/use-health";
import { usePending, usePendingActions } from "../hooks/use-pending";
import { ErrorState } from "../components/state/ErrorState";
import { EmptyState } from "../components/state/EmptyState";
import { Skeleton } from "../components/state/Skeleton";

const btn =
  "rounded-md border border-zinc-200 dark:border-zinc-700 px-2.5 py-1 text-[12.5px] hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50";

function Row({ item }: { item: PendingItem }): React.JSX.Element {
  const actions = usePendingActions();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const error = (actions.convert.error ?? actions.archive.error) as Error | null;

  return (
    <li
      data-testid={`decide-item-${item.id}`}
      className="rounded-md border border-zinc-200 dark:border-zinc-800 px-3 py-2.5"
    >
      <details>
        <summary className="cursor-pointer text-sm font-medium">{item.title || item.id}</summary>
        <p className="mt-1.5 whitespace-pre-wrap text-[12.5px] text-zinc-600 dark:text-zinc-300">
          {item.content}
        </p>
      </details>
      <p className="mt-1 text-[11px] text-zinc-400">
        {item.id} · {item.createdAt.slice(0, 10)}
        {item.workspaceId ? ` · ${item.workspaceId}` : ""}
      </p>
      {created ? (
        <p role="status" className="mt-2 text-[12.5px] text-emerald-700 dark:text-emerald-400">
          Đã tạo{" "}
          <Link to={`/tasks/${encodeURIComponent(created)}`} className="underline">
            {created}
          </Link>
        </p>
      ) : rejecting ? (
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            data-testid={`decide-reason-${item.id}`}
            aria-label="Lý do bỏ"
            placeholder="Lý do bỏ"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="min-w-0 flex-1 rounded-md border border-zinc-200 dark:border-zinc-700 bg-transparent px-2 py-1 text-[12.5px]"
          />
          <span className="flex gap-2">
            <button
              type="button"
              data-testid={`decide-archive-save-${item.id}`}
              className={btn}
              disabled={reason.trim() === "" || actions.archive.isPending}
              onClick={() => actions.archive.mutate({ id: item.id, reason: reason.trim() })}
            >
              Lưu
            </button>
            <button type="button" className={btn} onClick={() => setRejecting(false)}>
              Hủy
            </button>
          </span>
        </div>
      ) : (
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            data-testid={`decide-convert-${item.id}`}
            className={btn}
            disabled={actions.convert.isPending}
            onClick={() =>
              actions.convert.mutate(item.id, { onSuccess: (r) => setCreated(r.taskId) })
            }
          >
            Duyệt → task
          </button>
          <button
            type="button"
            data-testid={`decide-archive-${item.id}`}
            className={btn}
            onClick={() => {
              setRejecting(true);
              setReason("");
            }}
          >
            Bỏ
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-[12px] text-red-600">
          {error.message}
        </p>
      )}
    </li>
  );
}

function Block({
  id,
  title,
  hint,
  items,
  emphasis = false,
}: {
  id: string;
  title: string;
  hint: string;
  items: PendingItem[];
  emphasis?: boolean;
}): React.JSX.Element | null {
  if (items.length === 0) return null;
  return (
    <section
      data-testid={id}
      className={
        emphasis
          ? "rounded-lg border-2 border-blue-500/60 bg-blue-50/40 dark:bg-blue-950/20 p-3"
          : ""
      }
    >
      <h2 className="mb-0.5 text-sm font-medium">
        {title} <span className="ml-1 text-zinc-400 tabular-nums">{items.length}</span>
      </h2>
      <p className="mb-2 text-[11.5px] text-zinc-500">{hint}</p>
      <ul className="space-y-2">
        {items.map((i) => (
          <Row key={i.id} item={i} />
        ))}
      </ul>
    </section>
  );
}

export function DecideView(): React.JSX.Element {
  const health = useOutletContext<HealthView>();
  const { items, isLoading, isError } = usePending();

  function body(): React.JSX.Element {
    if (health.conn === "disconnected") {
      return (
        <ErrorState
          variant="unreachable"
          description="Không đọc được danh sách — đây không phải là 'không có gì đang chờ'."
        />
      );
    }
    if (isError) return <ErrorState variant="failed" subject="the pending items" />;
    if (isLoading) return <Skeleton shape="list" label="Đang tải…" />;
    if (items.length === 0) {
      return (
        <EmptyState
          icon="ti-circle-check"
          title="Không có gì đang chờ anh"
          description="Màn này hiện những gì daily digest và improve loop gửi vào inbox mà chưa ai quyết."
        />
      );
    }
    const digest = items.filter((i) => i.source === "activity-digest");
    const improve = items.filter((i) => i.source === "improve");
    const notes = items.filter((i) => i.source === "improve-note");
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto pb-6">
        <Block
          id="decide-block-digest"
          title="Từ daily digest"
          hint="Ý tưởng cải thiện cách anh làm việc, rút ra từ hoạt động của anh."
          items={digest}
          emphasis
        />
        <Block
          id="decide-block-improve"
          title="Đề xuất cải tiến"
          hint="Improve loop đề xuất sửa app, kèm bằng chứng và tiêu chí kiểm chứng."
          items={[...improve].sort((a, b) => (a.workspaceId ?? "").localeCompare(b.workspaceId ?? ""))}
        />
        <Block
          id="decide-block-notes"
          title="Ghi chú"
          hint="Thông báo và câu hỏi từ improve loop."
          items={notes}
        />
      </div>
    );
  }

  return (
    <section aria-label="decide" className="flex min-h-0 flex-1 flex-col">
      <div className="mb-4 flex items-baseline gap-2">
        <h1 className="text-lg font-medium">Cần anh quyết</h1>
        <span className="text-xs text-zinc-400">những gì công cụ tự động gửi vào và đang chờ anh</span>
      </div>
      {body()}
    </section>
  );
}
