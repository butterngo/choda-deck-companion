const CHIPS: Array<{ key: string; label: string }> = [
  { key: "", label: "All" },
  { key: "running", label: "Running" },
  { key: "finished", label: "Done" },
  { key: "failed", label: "Failed" },
];

export function StatusChips({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 mb-3" role="tablist" aria-label="Status filter">
      {CHIPS.map((c) => {
        const active = c.key === value;
        return (
          <button
            key={c.key || "all"}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(c.key)}
            className={`px-2.5 py-1 text-[12px] rounded-full border ${
              active
                ? "border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100"
                : "border-zinc-200 dark:border-zinc-700 text-zinc-500"
            }`}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}
