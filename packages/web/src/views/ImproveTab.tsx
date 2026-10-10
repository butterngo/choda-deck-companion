// TASK-2359 — the improve loop (TASK-2352) for one workspace, as a workspace tab.
//
// Everything here is read from GET /improve/:ws (choda-deck TASK-2357). The
// numbers come from `choda-deck improve measure` and the agent scores from the
// evaluator; this view computes nothing but the day-over-day change. The writes
// are the human's half of the loop: pick a mode, run now, approve or reject a
// proposal, tick a criterion "good enough".
//
// Proposals sit at the TOP: they are the only thing on this tab that waits for
// a decision, and a decision buried under charts is one nobody makes.

import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import {
  improveScreenshotUrl,
  type ImproveConfig,
  type ImproveCriterionScore,
  type ImproveMode,
  type ImproveOverview,
  type ImproveScorecard,
} from "../api";
import type { HealthView } from "../hooks/use-health";
import { useImprove, useImproveActions, useImproveRun } from "../hooks/use-improve";
import { Trend } from "../components/Trend";
import { ErrorState } from "../components/state/ErrorState";
import { EmptyState } from "../components/state/EmptyState";
import { Skeleton } from "../components/state/Skeleton";

const MODES: { mode: ImproveMode; label: string }[] = [
  { mode: "off", label: "Off" },
  { mode: "manual", label: "Manual" },
  { mode: "scheduled", label: "Scheduled" },
];

const MODE_DOT: Record<ImproveMode, string> = {
  off: "bg-zinc-300 dark:bg-zinc-600",
  manual: "bg-blue-500",
  scheduled: "bg-emerald-500",
};

const BY_LABEL: Record<ImproveCriterionScore["by"], string> = {
  auto: "Tự động",
  agent: "Agent",
  you: "Bạn",
};

const btn =
  "rounded-md border border-zinc-200 dark:border-zinc-700 px-2.5 py-1 text-[12.5px] hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50";
const heading = "mb-2 text-[11px] uppercase tracking-wide text-zinc-400";

/** The dot beside the tab label. Renders nothing until the mode is known. */
export function ImproveModeDot({ workspaceId }: { workspaceId: string }): React.JSX.Element | null {
  const { overview } = useImprove(workspaceId);
  const mode = overview?.config?.mode;
  if (!mode) return null;
  return (
    <span
      data-testid={`improve-mode-dot-${mode}`}
      aria-label={`improve loop: ${mode}`}
      className={`ml-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle ${MODE_DOT[mode]}`}
    />
  );
}

function formatValue(c: ImproveCriterionScore): string {
  const v = c.value;
  if (v === null) return "—";
  if (typeof v === "boolean") return v ? "pass" : "fail";
  if (c.by !== "auto") return `${v}/5`;
  if (c.measure === "test") return `${Math.round(v * 1000) / 10}%`;
  if (c.measure.startsWith("lcp:")) return `${Math.round(v)} ms`;
  return String(v);
}

function change(today: ImproveCriterionScore, before: ImproveCriterionScore | undefined): string {
  if (!before || typeof today.value !== "number" || typeof before.value !== "number") return "—";
  const d = today.value - before.value;
  if (d === 0) return "0";
  const scaled = today.measure === "test" ? Math.round(d * 1000) / 10 : Math.round(d * 10) / 10;
  return `${d > 0 ? "+" : ""}${scaled}`;
}

/** Days whose scorecard was measured on a different commit than the day before — something shipped. */
function shipDays(cards: ImproveScorecard[]): string[] {
  return cards
    .filter((c, i) => i > 0 && c.commit !== null && c.commit !== cards[i - 1]?.commit)
    .map((c) => c.date);
}

function proposalText(ws: string, content: string): string {
  const tag = `[improve:${ws}]`;
  return content.startsWith(tag) ? content.slice(tag.length).trim() : content;
}

function ControlBar({
  ws,
  config,
  overview,
  onSettings,
}: {
  ws: string;
  config: ImproveConfig;
  overview: ImproveOverview;
  onSettings: () => void;
}): React.JSX.Element {
  const actions = useImproveActions(ws);
  const [runId, setRunId] = useState<string | null>(null);
  const run = useImproveRun(ws, runId);
  const last = overview.runs[0];
  const running = (last !== undefined && last.endedAt === null) || (run !== null && run.endedAt === null);

  return (
    <div data-testid="improve-controls" className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label="improve mode" className="inline-flex rounded-md border border-zinc-200 dark:border-zinc-700 p-0.5">
          {MODES.map(({ mode, label }) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={config.mode === mode}
              data-testid={`improve-mode-${mode}`}
              disabled={actions.saveConfig.isPending}
              onClick={() => {
                if (config.mode !== mode) actions.saveConfig.mutate({ ...config, mode });
              }}
              className={[
                "rounded px-2.5 py-0.5 text-[12.5px]",
                config.mode === mode
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100",
              ].join(" ")}
            >
              {label}
            </button>
          ))}
        </div>
        <span data-testid="improve-last-run" className="text-[12px] text-zinc-500">
          {last === undefined
            ? "Chưa chạy lần nào"
            : last.endedAt === null
              ? `Đang chạy từ ${last.startedAt.slice(11, 16)}`
              : `Lần chạy cuối ${last.startedAt.slice(0, 16).replace("T", " ")} · exit ${last.exitCode ?? "?"}`}
        </span>
        <span className="ml-auto flex gap-2">
          <button type="button" data-testid="improve-open-settings" className={btn} onClick={onSettings}>
            <i className="ti ti-settings" aria-hidden="true" /> Cài đặt
          </button>
          <button
            type="button"
            data-testid="improve-run-now"
            className={btn}
            disabled={running || actions.run.isPending}
            onClick={() => actions.run.mutate(undefined, { onSuccess: (r) => setRunId(r.runId) })}
          >
            <i className="ti ti-player-play" aria-hidden="true" /> Chạy ngay
          </button>
        </span>
      </div>
      {actions.saveConfig.isError && (
        <p role="alert" className="text-[12px] text-red-600">{(actions.saveConfig.error as Error).message}</p>
      )}
      {actions.run.isError && (
        <p role="alert" className="text-[12px] text-red-600">{(actions.run.error as Error).message}</p>
      )}
      {run !== null && (
        <pre
          data-testid="improve-run-log"
          className="max-h-48 overflow-auto rounded-md bg-zinc-50 dark:bg-zinc-900 p-2 text-[11.5px] whitespace-pre-wrap"
        >
          {run.log || (run.endedAt === null ? "Đang chạy…" : "(không có output)")}
        </pre>
      )}
    </div>
  );
}

function Proposals({ ws, overview }: { ws: string; overview: ImproveOverview }): React.JSX.Element {
  const actions = useImproveActions(ws);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  return (
    <section data-testid="improve-proposals">
      <h2 className={heading}>Đề xuất hôm nay</h2>
      {overview.proposals.length === 0 ? (
        <p className="text-[12.5px] text-zinc-500">Không có đề xuất nào đang chờ.</p>
      ) : (
        <ul className="space-y-2">
          {overview.proposals.map((p) => (
            <li
              key={p.id}
              data-testid={`improve-proposal-${p.id}`}
              className="rounded-md border border-zinc-200 dark:border-zinc-800 px-3 py-2.5"
            >
              <p className="whitespace-pre-wrap text-sm">{proposalText(ws, p.content)}</p>
              {rejecting === p.id ? (
                <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    data-testid={`improve-reject-reason-${p.id}`}
                    aria-label="Lý do từ chối"
                    placeholder="Lý do từ chối"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="min-w-0 flex-1 rounded-md border border-zinc-200 dark:border-zinc-700 bg-transparent px-2 py-1 text-[12.5px]"
                  />
                  <span className="flex gap-2">
                    <button
                      type="button"
                      data-testid={`improve-reject-save-${p.id}`}
                      className={btn}
                      disabled={reason.trim() === "" || actions.reject.isPending}
                      onClick={() =>
                        actions.reject.mutate(
                          { inboxId: p.id, reason: reason.trim() },
                          {
                            onSuccess: () => {
                              setRejecting(null);
                              setReason("");
                            },
                          },
                        )
                      }
                    >
                      Lưu
                    </button>
                    <button type="button" className={btn} onClick={() => setRejecting(null)}>
                      Hủy
                    </button>
                  </span>
                </div>
              ) : (
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    data-testid={`improve-approve-${p.id}`}
                    className={btn}
                    disabled={actions.approve.isPending}
                    onClick={() => actions.approve.mutate(p.id)}
                  >
                    Duyệt → task
                  </button>
                  <button
                    type="button"
                    data-testid={`improve-reject-${p.id}`}
                    className={btn}
                    onClick={() => {
                      setRejecting(p.id);
                      setReason("");
                    }}
                  >
                    Từ chối
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {(actions.approve.isError || actions.reject.isError) && (
        <p role="alert" className="mt-2 text-[12px] text-red-600">
          {((actions.approve.error ?? actions.reject.error) as Error).message}
        </p>
      )}
    </section>
  );
}

function Scorecard({ ws, config, overview }: { ws: string; config: ImproveConfig; overview: ImproveOverview }): React.JSX.Element {
  const actions = useImproveActions(ws);
  const cards = overview.scorecards;
  const today = cards[cards.length - 1];
  const before = cards[cards.length - 2];
  const th = "px-2.5 py-1.5 text-left font-medium text-zinc-500 whitespace-nowrap";
  const td = "px-2.5 py-1.5 tabular-nums whitespace-nowrap";

  function toggleGood(name: string, good: boolean): void {
    actions.saveConfig.mutate({
      ...config,
      criteria: config.criteria.map((c) => (c.name === name ? { ...c, good } : c)),
    });
  }

  return (
    <section data-testid="improve-scorecard">
      <h2 className={heading}>Scorecard{today ? ` · ${today.date}` : ""}</h2>
      {/* The table scrolls inside its own box: at phone width it is wider than
          the screen, and the page around it must not scroll sideways. */}
      <div data-testid="improve-scorecard-scroll" className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead className="border-b border-zinc-200 dark:border-zinc-800">
            <tr>
              <th className={th}>Tiêu chí</th>
              <th className={th}>Ai chấm</th>
              <th className={th}>Hôm nay</th>
              <th className={th}>Thay đổi</th>
              <th className={th}>Mục tiêu</th>
              <th className={th}>Đủ tốt</th>
            </tr>
          </thead>
          <tbody>
            {config.criteria.map((c) => {
              const now = today?.criteria.find((s) => s.name === c.name);
              const prev = before?.criteria.find((s) => s.name === c.name);
              return (
                <tr key={c.name} data-testid={`improve-criterion-${c.name}`} className="border-b border-zinc-100 dark:border-zinc-800/60">
                  <td className={`${td} font-medium`}>{c.name}</td>
                  <td className={td}>
                    <span className="rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-600 dark:text-zinc-300">
                      {BY_LABEL[c.by]}
                    </span>
                  </td>
                  <td className={td}>{now ? formatValue(now) : "—"}</td>
                  <td className={td}>{now ? change(now, prev) : "—"}</td>
                  <td className={td}>{String(c.target)}</td>
                  <td className={td}>
                    <input
                      type="checkbox"
                      aria-label={`${c.name} đủ tốt`}
                      data-testid={`improve-good-${c.name}`}
                      checked={c.good === true}
                      disabled={actions.saveConfig.isPending}
                      onChange={(e) => toggleGood(c.name, e.target.checked)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {today === undefined && (
        <p className="mt-2 text-[12px] text-zinc-500">
          Chưa có scorecard — chạy <code>choda-deck improve measure {ws}</code> hoặc bấm Chạy ngay.
        </p>
      )}
    </section>
  );
}

function Screenshots({ ws, overview }: { ws: string; overview: ImproveOverview }): React.JSX.Element | null {
  const cards = overview.scorecards;
  const today = cards[cards.length - 1];
  if (!today || today.pages.length === 0) return null;
  const before = cards[cards.length - 2];
  const notes = today.criteria.filter((c) => c.by === "agent" && c.note);

  return (
    <section data-testid="improve-screenshots">
      <h2 className={heading}>Ảnh chụp</h2>
      <div className="space-y-4">
        {today.pages.map((p) => {
          const prev = before?.pages.find((q) => q.path === p.path);
          return (
            <div key={p.path}>
              <p className="mb-1 font-mono text-[11.5px] text-zinc-500">
                {p.path}
                {p.uiChanged && <span className="ml-2 text-amber-600">đã đổi</span>}
              </p>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {[
                  { label: "Hôm qua", shot: prev?.screenshot },
                  { label: "Hôm nay", shot: p.screenshot },
                ].map(({ label, shot }) => (
                  <figure key={label} className="rounded-md border border-zinc-200 dark:border-zinc-800 p-1.5">
                    <figcaption className="mb-1 text-[11px] text-zinc-400">{label}</figcaption>
                    {shot ? (
                      <img src={improveScreenshotUrl(ws, shot)} alt={`${p.path} ${label}`} className="w-full" />
                    ) : (
                      <p className="px-1 py-6 text-center text-[11.5px] text-zinc-400">Không có ảnh</p>
                    )}
                  </figure>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {notes.length > 0 && (
        <div data-testid="improve-evaluator-notes" className="mt-3 space-y-1.5">
          {notes.map((c) => (
            <p key={c.name} className="text-[12.5px]">
              <span className="font-medium">{c.name}</span> · {formatValue(c)} — {c.note}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}

function Trends({ config, overview }: { config: ImproveConfig; overview: ImproveOverview }): React.JSX.Element | null {
  const cards = overview.scorecards;
  if (cards.length === 0) return null;
  const markers = shipDays(cards);
  const series = config.criteria
    .map((c) => ({
      c,
      points: cards.flatMap((card) => {
        const s = card.criteria.find((x) => x.name === c.name);
        if (!s || s.value === null) return [];
        const value = typeof s.value === "boolean" ? (s.value ? 1 : 0) : s.value;
        return [{ date: card.date, value, label: formatValue(s) }];
      }),
    }))
    .filter((s) => s.points.length > 0);
  if (series.length === 0) return null;

  return (
    <section data-testid="improve-trends">
      <h2 className={heading}>Xu hướng 14 ngày</h2>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {series.map(({ c, points }) => (
          <Trend key={c.name} testId={`improve-trend-${c.name}`} title={c.name} hint={`mục tiêu ${c.target}`} points={points} markers={markers} />
        ))}
      </div>
      {markers.length > 0 && <p className="mt-1.5 text-[11px] text-zinc-400">Vạch đứt: ngày có commit mới.</p>}
    </section>
  );
}

function History({ overview }: { overview: ImproveOverview }): React.JSX.Element {
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
      <section data-testid="improve-rejected">
        <h2 className={heading}>Ý tưởng đã từ chối</h2>
        {overview.rejected.length === 0 ? (
          <p className="text-[12.5px] text-zinc-500">Chưa có.</p>
        ) : (
          <ul className="space-y-1.5 text-[12.5px]">
            {overview.rejected.map((r) => (
              <li key={r.inboxId}>
                <span className="text-zinc-400">{r.at.slice(0, 10)}</span> {r.reason}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section data-testid="improve-runs">
        <h2 className={heading}>Lịch sử chạy</h2>
        {overview.runs.length === 0 ? (
          <p className="text-[12.5px] text-zinc-500">Chưa chạy lần nào.</p>
        ) : (
          <ul className="space-y-1 text-[12.5px] tabular-nums">
            {overview.runs.map((r) => (
              <li key={r.runId}>
                {r.startedAt.slice(0, 16).replace("T", " ")} ·{" "}
                {r.endedAt === null ? "đang chạy" : `exit ${r.exitCode ?? "?"}`}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export function ImproveTab({ workspaceId }: { workspaceId: string }): React.JSX.Element {
  const health = useOutletContext<HealthView>();
  const { overview, isLoading, isError } = useImprove(workspaceId);
  const [settings, setSettings] = useState(false);

  if (health.conn === "disconnected") {
    return <ErrorState variant="unreachable" description="The improve loop is unavailable — this is not a workspace without one." />;
  }
  if (isError) return <ErrorState variant="failed" subject="the improve loop" />;
  if (isLoading || overview === null) return <Skeleton shape="list" label="Loading improve loop…" />;

  if (settings) {
    // TASK-2360 renders the settings form here.
    return (
      <div data-testid="improve-settings" className="space-y-2">
        <button type="button" className={btn} onClick={() => setSettings(false)}>
          <i className="ti ti-arrow-left" aria-hidden="true" /> Improve
        </button>
        <p className="text-[12.5px] text-zinc-500">
          Màn cài đặt chưa có — sửa <code>.choda/improve.json</code> trong workspace.
        </p>
      </div>
    );
  }

  const config = overview.config;
  if (config === null) {
    const invalid = overview.configError?.[0];
    return (
      <EmptyState
        icon="ti-trending-up"
        title={invalid ? "improve.json không hợp lệ" : "Chưa bật improve loop"}
        description={
          invalid
            ? `${invalid.field}: ${invalid.message}`
            : "Workspace này chưa có .choda/improve.json. Mở Cài đặt để chọn cách đo và tiêu chí."
        }
        action={
          <button type="button" data-testid="improve-open-settings" className={btn} onClick={() => setSettings(true)}>
            <i className="ti ti-settings" aria-hidden="true" /> Cài đặt
          </button>
        }
      />
    );
  }

  return (
    <div data-testid="improve-tab" className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto pb-6">
      <ControlBar ws={workspaceId} config={config} overview={overview} onSettings={() => setSettings(true)} />
      <Proposals ws={workspaceId} overview={overview} />
      <Scorecard ws={workspaceId} config={config} overview={overview} />
      <Screenshots ws={workspaceId} overview={overview} />
      <Trends config={config} overview={overview} />
      <History overview={overview} />
    </div>
  );
}
