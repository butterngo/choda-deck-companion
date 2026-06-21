import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { LedgerTable } from "../LedgerTable";
import type { LedgerRow } from "../../api";

const ROWS: LedgerRow[] = [
  { entity: "tasks", inSync: 27, localOnly: 770, remoteOnly: 0, tombstoned: 0 },
  { entity: "inbox", inSync: 1, localOnly: 501, remoteOnly: 17, tombstoned: 2 },
];

describe("LedgerTable", () => {
  it("renders one row per entity with the four bucket counts", () => {
    render(<LedgerTable rows={ROWS} />);
    const tasks = screen.getByRole("row", { name: /Tasks/ });
    expect(within(tasks).getByText("27")).toBeInTheDocument();
    expect(within(tasks).getByText("770")).toBeInTheDocument();

    const inbox = document.querySelector('tr[data-entity="inbox"]')!;
    expect(inbox.querySelector('[data-bucket="remoteOnly"]')!.textContent).toBe("17");
    expect(inbox.querySelector('[data-bucket="tombstoned"]')!.textContent).toBe("2");
  });

  it("labels the tombstone bucket 'removed via sync' and remote-only as Claude Design", () => {
    render(<LedgerTable rows={ROWS} />);
    expect(screen.getByText(/removed via sync/i)).toBeInTheDocument();
    expect(screen.getByText(/from Claude Design/i)).toBeInTheDocument();
  });
});
