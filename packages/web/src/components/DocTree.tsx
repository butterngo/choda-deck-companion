// TASK-1749 — a file tree over a flat list of relative paths. The adapter
// returns paths, not a tree, because a tree is a rendering concern and the wire
// shape should not have to agree with how this view happens to group things.
//
// Folders start CLOSED. That reverses TASK-1780, and the reason is worth
// keeping rather than quietly editing away.
//
// TASK-1780 opened them, and justified it by measurement: "a doc browser you
// have to unfold before you can see anything is a worse first screen than a
// slightly long list, and the measured sizes are small enough for it: 26 files
// in the companion, 199 in choda-deck". That was true of a .md-only listing.
//
// TASK-1787 widened the listing to the whole tree and the numbers moved by one
// to two orders of magnitude: companion 26 -> 425, choda-deck 199 -> 986,
// remote-workflow 61 -> 1,784, ABC 4,176. "A slightly long list" was true at 26;
// at 4,176 it is a wall, and the first screen became worse than the unfolding it
// was meant to avoid. The decision did not change its mind — the fact under it
// changed (TASK-1790).
//
// The state model inverts with it. TASK-1780 stored CLOSED paths because "an
// empty set then means everything is expanded, which is the documented default".
// The documented default is now the other one, so the same reasoning gives the
// opposite answer: store OPEN paths, and empty means shut.
//
// State is held once, in DocTree, rather than per Row. Per-row state happens to
// survive selecting another file today — React keeps the instance because the
// key is stable — but that is a property of the reconciler, not a decision.

import { useMemo, useState } from "react";
import type { WorkspaceDoc } from "../api";

interface TreeNode {
  name: string;
  path: string;
  children: TreeNode[];
  doc: WorkspaceDoc | null;
}

function insert(root: TreeNode, doc: WorkspaceDoc): void {
  const segments = doc.path.split("/");
  let node = root;
  segments.forEach((segment, i) => {
    const isFile = i === segments.length - 1;
    const path = segments.slice(0, i + 1).join("/");
    let child = node.children.find((c) => c.name === segment && (c.doc === null) !== isFile);
    if (!child) {
      child = { name: segment, path, children: [], doc: isFile ? doc : null };
      node.children.push(child);
    }
    node = child;
  });
}

/** Folders before files, each alphabetical — the order a file browser uses. */
function sortTree(node: TreeNode): void {
  node.children.sort((a, b) => {
    const aDir = a.doc === null;
    const bDir = b.doc === null;
    if (aDir !== bDir) return aDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  node.children.forEach(sortTree);
}

function countFiles(node: TreeNode): number {
  return node.doc ? 1 : node.children.reduce((n, c) => n + countFiles(c), 0);
}

function Row({
  node,
  depth,
  selected,
  onSelect,
  expanded,
  onToggle,
}: {
  node: TreeNode;
  depth: number;
  selected: string | null;
  onSelect: (path: string) => void;
  expanded: Set<string>;
  onToggle: (path: string) => void;
}): React.JSX.Element {
  const indent = { paddingLeft: `${depth * 16}px` };

  if (node.doc === null) {
    const open = expanded.has(node.path);
    return (
      <div>
        <button
          type="button"
          aria-expanded={open}
          data-testid={`doc-tree-folder-${node.path}`}
          onClick={() => onToggle(node.path)}
          className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
          style={indent}
        >
          <i
            className={`ti ti-chevron-down flex-none text-zinc-400 transition-transform ${
              open ? "" : "-rotate-90"
            }`}
            aria-hidden="true"
          />
          <i
            className={`ti ${open ? "ti-folder-open" : "ti-folder"} flex-none text-zinc-400`}
            aria-hidden="true"
          />
          <span className="min-w-0 truncate text-xs">{node.name}</span>
          {/* The count stays visible while closed — a folder you cannot see into
              should still say how much it is hiding. */}
          <span className="ml-auto flex-none text-[11px] tabular-nums text-zinc-400">
            {countFiles(node)}
          </span>
        </button>
        {/* Collapsed children leave the DOM entirely, not merely the screen.
            Hidden rows a screen reader can still reach are worse than no rows,
            and the same rule already governs SidebarNav's Knowledge group. */}
        {open &&
          node.children.map((c) => (
            <Row
              key={c.path}
              node={c}
              depth={depth + 1}
              selected={selected}
              onSelect={onSelect}
              expanded={expanded}
              onToggle={onToggle}
            />
          ))}
      </div>
    );
  }

  const isSelected = selected === node.path;
  return (
    <button
      type="button"
      onClick={() => onSelect(node.path)}
      aria-current={isSelected ? "true" : undefined}
      className={[
        "flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left",
        isSelected
          ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium"
          : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50",
      ].join(" ")}
      style={indent}
    >
      <i className="ti ti-file-text flex-none text-zinc-400" aria-hidden="true" />
      <span className="min-w-0 truncate text-xs">{node.name}</span>
    </button>
  );
}

/**
 * Every folder on the way down to `path`, so a deep-linked file is visible
 * rather than merely present. `docs/knowledge/a.md` yields `docs` and
 * `docs/knowledge` — the file itself is not a folder and is not included.
 */
function ancestorsOf(path: string | null): Set<string> {
  const out = new Set<string>();
  if (path === null) return out;
  const segments = path.split("/");
  for (let i = 1; i < segments.length; i += 1) {
    out.add(segments.slice(0, i).join("/"));
  }
  return out;
}

export function DocTree({
  docs,
  selected,
  onSelect,
}: {
  docs: WorkspaceDoc[];
  selected: string | null;
  onSelect: (path: string) => void;
}): React.JSX.Element {
  const root = useMemo(() => {
    const r: TreeNode = { name: "", path: "", children: [], doc: null };
    docs.forEach((d) => insert(r, d));
    sortTree(r);
    return r;
  }, [docs]);

  // A set of OPEN paths — empty means everything is shut, which is now the
  // documented default. See the note at the top for why this inverted.
  //
  // Seeded with the ancestors of whatever is already selected. Without that, a
  // file reached by ?path= — how TaskProvenance deep-links to a changed file,
  // and how ProjectsView links — sits inside a closed folder and is therefore
  // not in the DOM at all: the reader pane shows the file while the tree looks
  // like nothing was selected. Same "renders but cannot be reached" family as
  // INBOX-1875 and TASK-1786, reached from a third direction.
  //
  // Initial state only, deliberately. A later selection can only come from
  // clicking a row that is already visible, so its ancestors are already open;
  // re-seeding on every change would instead fight a reader who closed a folder
  // on purpose — the bug TASK-1766 already fixed once for ?workspaceId=.
  const [expanded, setExpanded] = useState<Set<string>>(() => ancestorsOf(selected));

  const onToggle = (path: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(path)) next.add(path);
      return next;
    });
  };

  return (
    <div data-testid="doc-tree" className="flex flex-col">
      {root.children.map((c) => (
        <Row
          key={c.path}
          node={c}
          depth={0}
          selected={selected}
          onSelect={onSelect}
          expanded={expanded}
          onToggle={onToggle}
        />
      ))}
    </div>
  );
}
