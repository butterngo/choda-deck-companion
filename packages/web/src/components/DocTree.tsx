// TASK-1749 — a file tree over a flat list of relative paths. The adapter
// returns paths, not a tree, because a tree is a rendering concern and the wire
// shape should not have to agree with how this view happens to group things.
//
// Folders start open. A doc browser you have to unfold before you can see
// anything is a worse first screen than a slightly long list, and the measured
// sizes are small enough for it: 26 files in the companion, 199 in choda-deck.
//
// TASK-1780 — they can now be CLOSED. Starting open is still right, but on
// choda-deck the tree buries the real docs under data/artifacts/captures/
// (INBOX-1868), and the chevron this component already drew was decorative:
// static, aria-hidden, wired to nothing. A control that looks like a control
// and does nothing is worse than no control.
//
// Collapse state is held once, in DocTree, rather than per Row. Per-row state
// happens to survive selecting another file today — React keeps the instance
// because the key is stable — but that is a property of the reconciler, not a
// decision, and AC-2 is about the guarantee rather than the accident.

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
  collapsed,
  onToggle,
}: {
  node: TreeNode;
  depth: number;
  selected: string | null;
  onSelect: (path: string) => void;
  collapsed: Set<string>;
  onToggle: (path: string) => void;
}): React.JSX.Element {
  const indent = { paddingLeft: `${depth * 16}px` };

  if (node.doc === null) {
    const open = !collapsed.has(node.path);
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
              collapsed={collapsed}
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

  // A set of CLOSED paths, not open ones: empty means everything is expanded,
  // which is the default the comment at the top of this file describes. Storing
  // the open set instead would make "no state yet" mean "all folders shut".
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  const onToggle = (path: string): void => {
    setCollapsed((prev) => {
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
          collapsed={collapsed}
          onToggle={onToggle}
        />
      ))}
    </div>
  );
}
