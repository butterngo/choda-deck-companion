import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmptyState } from "../EmptyState";

describe("EmptyState", () => {
  it("renders the title and description", () => {
    render(<EmptyState title="Nothing ready" description="No task is marked READY." />);
    expect(screen.getByText("Nothing ready")).toBeInTheDocument();
    expect(screen.getByText("No task is marked READY.")).toBeInTheDocument();
  });

  it("renders no button at all when there is no action", () => {
    // The failure this guards: an always-rendered wrapper leaves a stray focus
    // stop and a gap under every empty state in the app.
    render(<EmptyState title="Nothing ready" />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders the action when one is given", () => {
    render(
      <EmptyState title="No matches" action={<button type="button">Clear search</button>} />
    );
    expect(screen.getByRole("button", { name: "Clear search" })).toBeInTheDocument();
  });

  it("does not use error colour — empty is not a failure", () => {
    const { container } = render(<EmptyState title="Inbox is clear" />);
    expect(container.innerHTML).not.toMatch(/rose-/);
  });
});
