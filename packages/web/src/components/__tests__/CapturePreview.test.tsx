import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CapturePreview } from "../CapturePreview";

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

describe("CapturePreview", () => {
  it("renders the image and the save/copy/clear actions", () => {
    render(<CapturePreview dataUrl={PNG} filename="shot.png" onClear={vi.fn()} />);
    expect(screen.getByAltText("capture preview")).toHaveAttribute("src", PNG);
    expect(screen.getByRole("button", { name: /save to disk/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy to clipboard/i })).toBeInTheDocument();
  });

  it("calls onClear when Clear is clicked", () => {
    const onClear = vi.fn();
    render(<CapturePreview dataUrl={PNG} filename="shot.png" onClear={onClear} />);
    screen.getByRole("button", { name: /clear/i }).click();
    expect(onClear).toHaveBeenCalledOnce();
  });
});
