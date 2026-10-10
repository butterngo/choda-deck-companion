// TASK-2360 — the improve loop's settings for ONE workspace: how to measure,
// what to score, how to run. The workspace is the route's (the Improve tab hands
// it down); there is deliberately no project or workspace picker here, because a
// config is a file inside one workspace and choosing another one mid-form would
// write somebody else's file.
//
// Save is a PUT of the whole file. The adapter validates it and answers 400 with
// every issue's field path; each message is shown under the input it names, so
// "criteria[1].target" lands under row 2's target and nowhere else.

import { useState } from "react";
import { ImproveConfigSaveError, type CriterionBy, type ImproveConfig, type ImproveMode } from "../api";
import { useImproveActions } from "../hooks/use-improve";
import {
  configFromForm,
  errorsByField,
  estimateTokens,
  formFromConfig,
  suggestedCriterion,
  type ImproveForm,
} from "../lib/improve-form";

const input =
  "w-full min-w-0 rounded-md border border-zinc-200 dark:border-zinc-700 bg-transparent px-2 py-1 text-[12.5px]";
const btn =
  "rounded-md border border-zinc-200 dark:border-zinc-700 px-2.5 py-1 text-[12.5px] hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50";
const step = "rounded-md border border-zinc-200 dark:border-zinc-800 p-3.5 space-y-3";

const MODES: { mode: ImproveMode; title: string; hint: string }[] = [
  { mode: "off", title: "Off", hint: "Không đo, không đề xuất." },
  { mode: "manual", title: "Manual", hint: "Chỉ chạy khi bấm Chạy ngay." },
  { mode: "scheduled", title: "Scheduled", hint: "Chạy mỗi sáng (ChodaImproveLoop, 08:45)." },
];

const CHIPS: { key: string; label: string }[] = [
  { key: "console", label: "Lỗi console" },
  { key: "a11y", label: "Accessibility" },
  { key: "bundle", label: "Bundle size" },
  { key: "copy", label: "Copy rõ ràng" },
  { key: "mobile", label: "Mobile ổn" },
];

function FieldError({ id, message }: { id: string; message: string | undefined }): React.JSX.Element | null {
  if (!message) return null;
  return (
    <p data-testid={id} role="alert" className="mt-0.5 text-[11.5px] text-red-600">
      {message}
    </p>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <label className="block text-[12px] text-zinc-500">
      <span className="mb-0.5 block">{label}</span>
      {children}
    </label>
  );
}

export function ImproveSettings({
  workspaceId,
  config,
  onClose,
}: {
  workspaceId: string;
  config: ImproveConfig | null;
  onClose: () => void;
}): React.JSX.Element {
  const actions = useImproveActions(workspaceId);
  const [form, setForm] = useState<ImproveForm>(() => formFromConfig(config));
  const [errors, setErrors] = useState<Map<string, string>>(new Map());
  const set = (patch: Partial<ImproveForm>): void => setForm((f) => ({ ...f, ...patch }));
  const err = (field: string): string | undefined => errors.get(field);
  const firstPage = form.pages.split("\n")[0]?.trim() ?? "/";
  const preview = configFromForm(form);
  const tokens = estimateTokens(form);
  const shown = new Set<string>();
  const e = (field: string): string | undefined => {
    shown.add(field);
    return err(field);
  };

  function save(): void {
    setErrors(new Map());
    actions.saveConfig.mutate(preview, {
      onSuccess: onClose,
      onError: (x) => {
        const issues =
          x instanceof ImproveConfigSaveError
            ? x.errors.length > 0
              ? x.errors
              : [{ field: x.field, message: x.message }]
            : [{ field: "", message: x.message }];
        setErrors(errorsByField(issues));
      },
    });
  }

  function setCriterion(i: number, patch: Partial<ImproveForm["criteria"][number]>): void {
    set({ criteria: form.criteria.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  }
  function setFlow(i: number, patch: Partial<ImproveForm["flows"][number]>): void {
    set({ flows: form.flows.map((f, j) => (j === i ? { ...f, ...patch } : f)) });
  }

  const body = (
    <div className="space-y-4">
      <section className={step} data-testid="improve-settings-measure">
        <h2 className="text-sm font-medium">1 · Cách đo</h2>
        <Labeled label="URL của app">
          <input data-testid="improve-url" className={input} value={form.url} onChange={(x) => set({ url: x.target.value })} />
        </Labeled>
        <FieldError id="improve-url-error" message={e("url")} />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <Labeled label="Lệnh khởi động (nếu app chưa chạy)">
              <input data-testid="improve-start-cmd" className={input} value={form.startCmd} onChange={(x) => set({ startCmd: x.target.value })} />
            </Labeled>
            <FieldError id="improve-start-cmd-error" message={e("startCmd")} />
          </div>
          <div>
            <Labeled label="Lệnh test">
              <input data-testid="improve-test-cmd" className={input} value={form.testCmd} onChange={(x) => set({ testCmd: x.target.value })} />
            </Labeled>
            <FieldError id="improve-test-cmd-error" message={e("testCmd")} />
          </div>
        </div>
        <Labeled label="Trang cần chụp (mỗi dòng một path)">
          <textarea data-testid="improve-pages" rows={3} className={`${input} font-mono`} value={form.pages} onChange={(x) => set({ pages: x.target.value })} />
        </Labeled>
        <FieldError id="improve-pages-error" message={e("pages")} />
        <div className="space-y-2">
          <p className="text-[12px] text-zinc-500">Flows</p>
          {form.flows.map((f, i) => (
            <div key={i} data-testid={`improve-flow-${i}`} className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_2fr_1.5fr_auto]">
              <div>
                <input aria-label={`flow ${i + 1} name`} data-testid={`improve-flow-name-${i}`} placeholder="tên" className={input} value={f.name} onChange={(x) => setFlow(i, { name: x.target.value })} />
                <FieldError id={`improve-flow-name-error-${i}`} message={e(`flows[${i}].name`)} />
              </div>
              <div>
                <input aria-label={`flow ${i + 1} steps`} data-testid={`improve-flow-steps-${i}`} placeholder="các bước" className={input} value={f.steps} onChange={(x) => setFlow(i, { steps: x.target.value })} />
                <FieldError id={`improve-flow-steps-error-${i}`} message={e(`flows[${i}].steps`)} />
              </div>
              <div>
                <input aria-label={`flow ${i + 1} spec`} data-testid={`improve-flow-spec-${i}`} placeholder="e2e/….spec.ts" className={`${input} font-mono`} value={f.spec} onChange={(x) => setFlow(i, { spec: x.target.value })} />
                <FieldError id={`improve-flow-spec-error-${i}`} message={e(`flows[${i}].spec`)} />
              </div>
              <button type="button" aria-label={`remove flow ${i + 1}`} className={btn} onClick={() => set({ flows: form.flows.filter((_, j) => j !== i) })}>
                <i className="ti ti-x" aria-hidden="true" />
              </button>
            </div>
          ))}
          <button type="button" data-testid="improve-add-flow" className={btn} onClick={() => set({ flows: [...form.flows, { name: "", steps: "", spec: "" }] })}>
            + Flow
          </button>
        </div>
      </section>

      <section className={step} data-testid="improve-settings-scorecard">
        <h2 className="text-sm font-medium">2 · Scorecard</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-left text-zinc-500">
                <th className="px-1.5 py-1 font-medium">Tên</th>
                <th className="px-1.5 py-1 font-medium">Ai chấm</th>
                <th className="px-1.5 py-1 font-medium">Đo bằng</th>
                <th className="px-1.5 py-1 font-medium">Mục tiêu</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {form.criteria.map((c, i) => (
                <tr key={i} data-testid={`improve-crit-${i}`} className="align-top">
                  <td className="px-1.5 py-1 min-w-[140px]">
                    <input aria-label={`criterion ${i + 1} name`} data-testid={`improve-crit-name-${i}`} className={input} value={c.name} onChange={(x) => setCriterion(i, { name: x.target.value })} />
                    <FieldError id={`improve-crit-name-error-${i}`} message={e(`criteria[${i}].name`)} />
                  </td>
                  <td className="px-1.5 py-1">
                    <select aria-label={`criterion ${i + 1} by`} data-testid={`improve-crit-by-${i}`} className={input} value={c.by} onChange={(x) => setCriterion(i, { by: x.target.value as CriterionBy })}>
                      <option value="auto">Tự động</option>
                      <option value="agent">Agent</option>
                      <option value="you">Bạn</option>
                    </select>
                    <FieldError id={`improve-crit-by-error-${i}`} message={e(`criteria[${i}].by`)} />
                  </td>
                  <td className="px-1.5 py-1 min-w-[200px]">
                    <input aria-label={`criterion ${i + 1} measure`} data-testid={`improve-crit-measure-${i}`} className={input} value={c.measure} onChange={(x) => setCriterion(i, { measure: x.target.value })} />
                    <FieldError id={`improve-crit-measure-error-${i}`} message={e(`criteria[${i}].measure`)} />
                  </td>
                  <td className="px-1.5 py-1 min-w-[100px]">
                    <input aria-label={`criterion ${i + 1} target`} data-testid={`improve-crit-target-${i}`} className={input} value={c.target} onChange={(x) => setCriterion(i, { target: x.target.value })} />
                    <FieldError id={`improve-crit-target-error-${i}`} message={e(`criteria[${i}].target`)} />
                  </td>
                  <td className="px-1.5 py-1">
                    <button type="button" aria-label={`remove criterion ${i + 1}`} className={btn} onClick={() => set({ criteria: form.criteria.filter((_, j) => j !== i) })}>
                      <i className="ti ti-trash" aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <FieldError id="improve-criteria-error" message={e("criteria")} />
        <div className="flex flex-wrap gap-1.5">
          {CHIPS.map((chip) => (
            <button key={chip.key} type="button" data-testid={`improve-chip-${chip.key}`} className={`${btn} rounded-full`} onClick={() => set({ criteria: [...form.criteria, suggestedCriterion(chip.key, firstPage)] })}>
              + {chip.label}
            </button>
          ))}
          <button type="button" data-testid="improve-add-criterion" className={`${btn} rounded-full`} onClick={() => set({ criteria: [...form.criteria, { name: "", by: "agent", measure: "", target: "", good: false }] })}>
            + Tiêu chí
          </button>
        </div>
      </section>

      <section className={step} data-testid="improve-settings-run">
        <h2 className="text-sm font-medium">3 · Chạy thế nào</h2>
        <div role="radiogroup" aria-label="improve mode" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {MODES.map((m) => (
            <button
              key={m.mode}
              type="button"
              role="radio"
              aria-checked={form.mode === m.mode}
              data-testid={`improve-settings-mode-${m.mode}`}
              onClick={() => set({ mode: m.mode })}
              className={[
                "rounded-md border px-3 py-2 text-left",
                form.mode === m.mode ? "border-zinc-900 dark:border-zinc-100" : "border-zinc-200 dark:border-zinc-700",
              ].join(" ")}
            >
              <span className="block text-sm font-medium">{m.title}</span>
              <span className="block text-[11.5px] text-zinc-500">{m.hint}</span>
            </button>
          ))}
        </div>
        <FieldError id="improve-mode-error" message={e("mode")} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <Labeled label="Model">
              <select data-testid="improve-model" className={input} value={form.model} onChange={(x) => set({ model: x.target.value })}>
                {Array.from(new Set(["sonnet", "opus", "haiku", form.model])).map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </Labeled>
            <FieldError id="improve-model-error" message={e("model")} />
          </div>
          <div>
            <Labeled label="Đề xuất tối đa / ngày">
              <input type="number" min={1} max={5} data-testid="improve-max-proposals" className={input} value={form.maxProposals} onChange={(x) => set({ maxProposals: Number(x.target.value) })} />
            </Labeled>
            <FieldError id="improve-max-proposals-error" message={e("maxProposals")} />
          </div>
          <div>
            <Labeled label="Dừng khi đứng yên N lần">
              <input type="number" min={1} max={30} data-testid="improve-stop-after-flat" className={input} value={form.stopAfterFlat} onChange={(x) => set({ stopAfterFlat: Number(x.target.value) })} />
            </Labeled>
            <FieldError id="improve-stop-after-flat-error" message={e("stopAfterFlat")} />
          </div>
        </div>
      </section>
    </div>
  );

  // Anything the adapter named that no input above claims — never dropped.
  const unplaced = [...errors].filter(([field]) => !shown.has(field));

  return (
    <div data-testid="improve-settings" className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-6">
      <div className="flex items-center gap-2">
        <button type="button" data-testid="improve-settings-back" className={btn} onClick={onClose}>
          <i className="ti ti-arrow-left" aria-hidden="true" /> Improve
        </button>
        <h1 className="text-sm font-medium">Cài đặt improve loop</h1>
        <button type="button" data-testid="improve-settings-save" className={`${btn} ml-auto`} disabled={actions.saveConfig.isPending} onClick={save}>
          Lưu
        </button>
      </div>
      {unplaced.length > 0 && (
        <div data-testid="improve-settings-errors" role="alert" className="text-[12px] text-red-600">
          {unplaced.map(([field, message]) => (
            <p key={field}>{field ? `${field}: ${message}` : message}</p>
          ))}
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        {body}
        <aside className="space-y-3 text-[12.5px]">
          <div className={step}>
            <h2 className="text-sm font-medium">Mỗi lần chạy</h2>
            <ol className="list-decimal space-y-1 pl-4 text-zinc-600 dark:text-zinc-300">
              <li>Chạy lệnh test, khởi động app nếu chưa chạy</li>
              <li>Chụp {preview.pages.length} trang, đo LCP và lỗi console</li>
              <li>Chạy {preview.flows.length} flow e2e</li>
              <li>Evaluator chấm các tiêu chí Agent từ ảnh</li>
              <li>Đề xuất tối đa {form.maxProposals} cải tiến vào inbox</li>
            </ol>
            <p data-testid="improve-token-estimate" className="text-zinc-500">
              {tokens === 0 ? "Không có tiêu chí Agent — không tốn token chấm." : `Ước tính ~${Math.round(tokens / 1000)}k token mỗi lần chạy.`}
            </p>
          </div>
          <div className={step}>
            <h2 className="text-sm font-medium">.choda/improve.json</h2>
            <pre data-testid="improve-config-preview" className="max-h-80 overflow-auto text-[11px]">
              {JSON.stringify(preview, null, 2)}
            </pre>
          </div>
        </aside>
      </div>
    </div>
  );
}
