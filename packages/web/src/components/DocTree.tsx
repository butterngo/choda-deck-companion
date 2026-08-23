// TASK-1749 — a file tree over a flat list of relative paths. The adapter
// returns paths, not a tree, because a tree is a rendering concern and the wire
// shape should not have to agree with how this view happens to group things.
//
// Folders start open. A doc browser you have to unfold before you can see
// anything is a worse first screen than a slightly long list, and the measured
// sizes are small enough for it: 26 files in the companion, 199 in choda-deck.

import { useMemo } from "react";
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
}: {
  node: TreeNode;
  depth: number;
  selected: string | null;
  onSelect: (path: string) => void;
}): React.JSX.Element {
  const indent = { paddingLeft: `${depth * 16}px` };

  if (node.doc === null) {
    return (
      <div>
        <div
          className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-zinc-600 dark:text-zinc-300"
          style={indent}
        >
          <i className="ti ti-chevron-down flex-none text-zinc-400" aria-hidden="true" />
          <i className="ti ti-folder flex-none text-zinc-400" aria-hidden="true" />
          <span className="min-w-0 truncate text-xs">{node.name}</span>
          <span className="ml-auto flex-none text-[11px] tabular-nums text-zinc-400">
            {countFiles(node)}
          </span>
        </div>
        {node.children.map((c) => (
          <Row key={c.path} node={c} depth={depth + 1} selected={selected} onSelect={onSelect} />
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

  return (
    <div data-testid="doc-tree" className="flex flex-col">
      {root.children.map((c) => (
        <Row key={c.path} node={c} depth={0} selected={selected} onSelect={onSelect} />
      ))}
    </div>
  );
}
