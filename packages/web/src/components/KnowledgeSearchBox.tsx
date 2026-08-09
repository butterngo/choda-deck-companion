// TASK-1174 AC-3 — search over GET /knowledge/search. Submit-triggered, never
// live: the request embeds the query, so firing per keystroke would be one
// embedding pass per character.
//
// TASK-1602 — reduced to the input. It used to own the query, the result and
// the rendering of both, which is why results could only appear stacked ABOVE
// the entry list. The view owns the result now, so results can replace the
// list instead of competing with it.

export function KnowledgeSearchBox({
  query,
  onQueryChange,
  onSubmit,
  onClear,
  isSearching,
  hasResult,
}: {
  query: string;
  onQueryChange: (q: string) => void;
  onSubmit: () => void;
  onClear: () => void;
  isSearching: boolean;
  hasResult: boolean;
}): React.JSX.Element {
  return (
    <form
      className="relative flex items-center mb-2"
      autoComplete="off"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <i
        className="ti ti-search absolute left-2.5 text-zinc-400 pointer-events-none"
        aria-hidden="true"
      />
      <input
        type="text"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Search knowledge…"
        aria-label="Search knowledge"
        className="w-full pl-7 pr-7 py-1.5 text-[13px] rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 outline-none focus:border-blue-500"
      />
      {isSearching ? (
        <i className="ti ti-refresh spin absolute right-2 text-zinc-400" aria-hidden="true" />
      ) : (
        (query.length > 0 || hasResult) && (
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear search"
            className="absolute right-1.5 p-1 rounded text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
          >
            <i className="ti ti-x" aria-hidden="true" />
          </button>
        )
      )}
    </form>
  );
}
