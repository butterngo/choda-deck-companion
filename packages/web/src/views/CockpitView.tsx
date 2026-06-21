// TASK-1159 — Cockpit pillar placeholder. The Workflow Cockpit (NOW/NEXT/DONE +
// inbox triage + actions) lands in TASK-1173.

export function CockpitView(): React.JSX.Element {
  return (
    <section aria-label="workflow cockpit">
      <h1 className="text-lg font-medium mb-1">Workflow Cockpit</h1>
      <p className="text-sm text-zinc-500">
        NOW / NEXT / DONE board + inbox triage land here — TASK-1173.
      </p>
    </section>
  );
}
