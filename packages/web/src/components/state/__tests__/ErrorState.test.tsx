import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ErrorState } from "../ErrorState";

// The apostrophe in the app's copy is typographic (’), matching every existing
// view. These regexes accept either form so the assertion tests the sentence,
// not the punctuation.
const CANT_REACH = /Can.t reach the laptop API/;

describe("ErrorState", () => {
  it("says the API is unreachable for variant=unreachable", () => {
    render(<ErrorState variant="unreachable" />);
    expect(screen.getByText(CANT_REACH)).toBeInTheDocument();
    // "unavailable, not empty" is the ADR-028 point, so assert it survives.
    expect(screen.getByText(/not an empty result/i)).toBeInTheDocument();
  });

  it("names the subject and never says 'can't reach' for variant=failed", () => {
    // THE criterion of this component. A single implementation that rendered
    // one message for both variants would pass every other test here.
    const { container } = render(<ErrorState variant="failed" subject="adr-028" />);
    expect(screen.getByText(/Couldn.t load adr-028/)).toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(CANT_REACH);
  });

  it("renders visibly different output for the two variants", () => {
    const { container: a } = render(<ErrorState variant="unreachable" />);
    const { container: b } = render(<ErrorState variant="failed" subject="the ledger" />);
    expect(a.innerHTML).not.toBe(b.innerHTML);
    expect(screen.getAllByRole("alert")).toHaveLength(2);
  });

  it("exposes the variant so callers can be asserted against it", () => {
    render(<ErrorState variant="failed" subject="x" />);
    expect(screen.getByTestId("error-state")).toHaveAttribute("data-variant", "failed");
  });

  it("uses a caller description when given, over the fallback", () => {
    render(<ErrorState variant="unreachable" description="Retrying every 15s." />);
    expect(screen.getByText("Retrying every 15s.")).toBeInTheDocument();
    expect(screen.queryByText(/not an empty result/i)).toBeNull();
  });
});
