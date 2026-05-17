import { useEffect, useState } from "react";

export function TaskSearchBox({
  value,
  onChange,
  placeholder = "Search task id or title…",
  debounceMs = 200,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  debounceMs?: number;
}) {
  const [local, setLocal] = useState(value);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  useEffect(() => {
    if (local === value) return;
    const h = setTimeout(() => onChange(local), debounceMs);
    return () => clearTimeout(h);
  }, [local, debounceMs, onChange, value]);

  return (
    <div className="flex items-center gap-2 mb-3">
      <i className="ti ti-search text-zinc-500" aria-hidden="true" />
      <input
        type="search"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder={placeholder}
        className="flex-1 bg-transparent border-b border-zinc-200 dark:border-zinc-700 py-1 text-sm focus:outline-none focus:border-zinc-500"
      />
    </div>
  );
}
