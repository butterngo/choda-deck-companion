import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusBar } from "../StatusBar";
import type { HealthView } from "../../hooks/use-health";

function view(partial: Partial<HealthView>): HealthView {
  return {
    health: { loopAlive: true, lastPullAgeSec: 12, jwtState: "refresh", reachable: true },
    conn: "connected",
    lastFetchedAgoSec: 3,
    ...partial,
  };
}

describe("StatusBar", () => {
  it("connected + loop alive shows the live dot and pull age, no stale banner", () => {
    render(<StatusBar view={view({ conn: "connected" })} />);
    const bar = screen.getByRole("status");
    expect(bar.dataset.conn).toBe("connected");
    expect(screen.getByText(/sync loop live/i)).toBeInTheDocument();
    expect(screen.getByText(/last pull 12s ago/i)).toBeInTheDocument();
    expect(screen.queryByText(/may be stale/i)).not.toBeInTheDocument();
  });

  it("stale shows the explicit stale banner — never a fresh-looking render", () => {
    render(<StatusBar view={view({ conn: "stale", lastFetchedAgoSec: 42 })} />);
    expect(screen.getByText(/may be stale — last fetched 42s ago/i)).toBeInTheDocument();
  });

  it("disconnected shows a clear disconnected indicator, not data", () => {
    render(<StatusBar view={view({ conn: "disconnected", health: null })} />);
    const bar = screen.getByRole("status");
    expect(bar.dataset.conn).toBe("disconnected");
    expect(screen.getByText(/disconnected from laptop api/i)).toBeInTheDocument();
    expect(screen.queryByText(/sync loop live/i)).not.toBeInTheDocument();
  });

  it("loop down renders a dead dot, not the live one", () => {
    render(
      <StatusBar
        view={view({
          conn: "connected",
          health: { loopAlive: false, lastPullAgeSec: null, jwtState: "unknown", reachable: false },
        })}
      />,
    );
    expect(screen.getByText(/loop down/i)).toBeInTheDocument();
  });
});
