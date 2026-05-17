export function AutoSafeFilter({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={value}
      onClick={() => onChange(!value)}
      className={`px-2.5 py-1 text-[12px] rounded-full border ${
        value
          ? "border-blue-600 text-blue-700 dark:text-blue-300 dark:border-blue-400"
          : "border-zinc-200 dark:border-zinc-700 text-zinc-500"
      }`}
      title="Filter tasks labeled auto-safe"
    >
      <i className="ti ti-shield-check mr-1" aria-hidden="true" />
      Auto-safe only
    </button>
  );
}
