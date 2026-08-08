import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Skeleton } from "../Skeleton";

describe("Skeleton", () => {
  it("announces loading once and hides the decorative bars from the a11y tree", () => {
    render(<Skeleton shape="list" />);
    // The wrapper is what a screen reader should pick up...
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    // ...and the bars must not be, or the reader walks a dozen empty divs.
    expect(screen.getByTestId("skeleton-bars")).toHaveAttribute("aria-hidden", "true");
  });

  it("renders a different structure per shape", () => {
    // The discriminator: a Skeleton that ignored `shape` and always drew the
    // same thing would pass a "renders something" check. Compare the actual
    // markup across shapes instead.
    const { container: list } = render(<Skeleton shape="list" />);
    const listHtml = list.innerHTML;
    const { container: card } = render(<Skeleton shape="card" />);
    const cardHtml = card.innerHTML;
    const { container: text } = render(<Skeleton shape="text" />);
    const textHtml = text.innerHTML;

    expect(listHtml).not.toBe(cardHtml);
    expect(cardHtml).not.toBe(textHtml);
    expect(listHtml).not.toBe(textHtml);
  });

  it("accepts a custom label so the announcement can name what is loading", () => {
    render(<Skeleton shape="text" label="Loading knowledge entries…" />);
    expect(screen.getByText("Loading knowledge entries…")).toBeInTheDocument();
  });
});
