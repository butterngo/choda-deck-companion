// A mermaid diagram follows the shell's `.dark` class on <html>. `neutral` in
// dark mode drew message labels and arrows dark grey on the dark page, which
// made sequence diagrams unreadable. The theme switch case is the
// discriminator: without a re-render the second theme never reaches mermaid.

import { describe, it, expect, vi, afterEach } from "vitest";
import { act, render, waitFor } from "@testing-library/react";

const themes: string[] = [];

vi.mock("mermaid", () => ({
  default: {
    initialize: (config: { theme: string }) => {
      themes.push(config.theme);
    },
    render: async (id: string) => ({ svg: `<svg data-id="${id}"></svg>` }),
  },
}));

const { MermaidBlock } = await import("../MermaidBlock");

afterEach(() => {
  themes.length = 0;
  document.documentElement.classList.remove("dark");
});

describe("MermaidBlock theme", () => {
  it("draws with the light theme when <html> has no .dark class", async () => {
    render(<MermaidBlock code="graph TD; A-->B;" />);
    await waitFor(() => expect(themes).toEqual(["neutral"]));
  });

  it("draws with the dark theme when <html> has the .dark class", async () => {
    document.documentElement.classList.add("dark");
    render(<MermaidBlock code="graph TD; A-->B;" />);
    await waitFor(() => expect(themes).toEqual(["dark"]));
  });

  it("re-draws in the new theme when the shell switches to dark", async () => {
    render(<MermaidBlock code="graph TD; A-->B;" />);
    await waitFor(() => expect(themes).toEqual(["neutral"]));
    act(() => {
      document.documentElement.classList.add("dark");
    });
    await waitFor(() => expect(themes).toEqual(["neutral", "dark"]));
  });
});
