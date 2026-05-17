import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Markdown } from "../Markdown";

describe("Markdown", () => {
  it("renders basic markdown", () => {
    render(<Markdown source={"# Hello\n\nWorld"} />);
    expect(screen.getByRole("heading", { level: 1, name: /hello/i })).toBeInTheDocument();
  });

  it("strips <script> tags", () => {
    const { container } = render(<Markdown source={'Hi<script>alert(1)</script>'} />);
    expect(container.querySelector("script")).toBeNull();
    expect(container.innerHTML).not.toContain("alert(1)");
  });

  it("strips inline event handlers", () => {
    const { container } = render(<Markdown source={'<img src=x onerror="alert(1)" />'} />);
    const img = container.querySelector("img");
    if (img) {
      expect(img.getAttribute("onerror")).toBeNull();
    }
    expect(container.innerHTML.toLowerCase()).not.toContain("onerror");
  });
});
