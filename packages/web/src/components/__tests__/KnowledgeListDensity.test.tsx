// TASK-1614 — list density. Kept separate so KnowledgeList's original test
// stays byte-for-byte unmodified, which is one of this task's criteria.

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { KnowledgeList } from "../KnowledgeList";
import type { KnowledgeListItem } from "../../api";

const entry = (slug: string, title: string, type = "decision"): KnowledgeListItem =>
  ({
    slug,
    title,
    type,
    projectId: "p",
    workspaceId: null,
    scope: "project",
    filePath: `/x/${slug}.md`,
    createdAt: "2026-01-01",
    lastVerifiedAt: "2026-01-01",
  }) as unknown as KnowledgeListItem;

const LONG =
  "Sweep threshold constants against real fixtures — a guessed cutoff lands on the data";

function list(selected: string | null = null) {
  return render(
    <KnowledgeList
      entries={[entry("a", LONG), entry("b", LONG + " again", "gotcha"), entry("c", "short")]}
      selectedType={null}
      onSelectType={vi.fn()}
      selectedSlug={selected}
      onSelect={vi.fn()}
    />
  );
}

const rows = (c: HTMLElement) => c.querySelectorAll('ul[aria-label="knowledge entries"] button');

describe("KnowledgeList density", () => {
  it("drops the slug line — it never distinguished anything", () => {
    // The slug is a kebab-cased copy of the title, so a row showing both spent
    // a whole line saying the same thing twice.
    list();
    expect(screen.queryByText("a")).toBeNull();
    expect(screen.getByText(LONG)).toBeInTheDocument();
  });

  it("clamps the title to two lines rather than truncating to one", () => {
    // Butter's call, against the real store: a one-line title truncates around
    // 30 characters in this pane and entries stop being distinguishable.
    const { container } = list();
    for (const r of rows(container)) {
      const title = r.querySelector("span");
      expect(title?.className).toMatch(/line-clamp-2/);
    }
  });

  it("carries no per-row border", () => {
    // 50 bordered cards read as 50 objects rather than one list.
    const { container } = list();
    for (const r of rows(container)) {
      expect(r.className).not.toMatch(/\bborder\b/);
      expect(r.className).not.toMatch(/border-zinc/);
    }
  });

  it("gives the full title back on hover, since two lines still clamp", () => {
    const { container } = list();
    expect(rows(container)[0]).toHaveAttribute("title", LONG);
  });

  it("shows the type as a coloured dot that differs per type", () => {
    // A single shared dot colour would still "have a dot" and tell you nothing.
    const { container } = list();
    const dotOf = (i: number) =>
      rows(container)[i].querySelector('span[aria-hidden="true"]')?.className ?? "";
    expect(dotOf(0)).not.toBe(dotOf(1)); // decision vs gotcha
  });

  it("still distinguishes the selected row after the border is gone", () => {
    const { container: plain } = list(null);
    const { container: picked } = list("a");
    expect(rows(picked)[0].className).not.toBe(rows(plain)[0].className);
    expect(picked.querySelector('button[aria-pressed="true"]')).toBeTruthy();
  });
});
