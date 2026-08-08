import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CapabilityNote } from "../CapabilityNote";

describe("CapabilityNote", () => {
  it("renders the reason it was given", () => {
    render(<CapabilityNote>Search is off — FTS is not compiled into this build.</CapabilityNote>);
    expect(screen.getByText(/Search is off/)).toBeInTheDocument();
  });

  it("carries no error colour — a disabled capability is a gap, not a failure", () => {
    // Painting this rose would train the eye to ignore real errors, so the
    // absence of rose- is the contract, asserted rather than trusted.
    const { container } = render(<CapabilityNote>anything</CapabilityNote>);
    expect(container.innerHTML).not.toMatch(/rose-/);
  });

  it("is not announced as an alert — it must not interrupt", () => {
    render(<CapabilityNote>anything</CapabilityNote>);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
