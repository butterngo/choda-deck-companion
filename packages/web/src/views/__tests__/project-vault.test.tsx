// TASK-2049 — the vault folder on a project.
//
// The pair that carries the weight is "no folder" vs "a folder with no
// meetings". Both have zero meetings, so a test that only checked the meetings
// list would pass for a component that rendered them identically — which is the
// exact bug this feature exists to avoid, because five of twelve projects are
// in the first state and it is not an error.
//
// The other careful one is AC-6: collapsing must not UNMOUNT. That is asserted
// against a real DOM node identity, not a render-count mock — a remount would
// hand back a different node, and a body that merely hid gives back the same one.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { ProjectVaultBlock } from "../ProjectVaultBlock";
import type { ProjectVault } from "../../api";

const WITH_MEETINGS: ProjectVault = {
  projectId: "juvenis-maxime",
  exists: true,
  relativePath: "vault/10-Projects/juvenis-maxime",
  contextFile: false,
  meetings: [
    {
      folder: "2026-09-20-kate",
      date: "2026-09-20",
      slug: "kate",
      files: [
        { name: "note.md", present: true, bytes: 34000 },
        { name: "transcript.md", present: true, bytes: 38000 },
      ],
    },
    {
      folder: "2026-09-17-chi-kate-v3",
      date: "2026-09-17",
      slug: "chi-kate-v3",
      files: [
        { name: "note.md", present: true, bytes: 36000 },
        { name: "transcript.md", present: true, bytes: 40000 },
      ],
    },
  ],
};

/** The shape already on Butter's disk: a transcript with no note beside it. */
const MISSING_NOTE: ProjectVault = {
  projectId: "headless-cms",
  exists: true,
  relativePath: "vault/10-Projects/headless-cms",
  contextFile: false,
  meetings: [
    {
      folder: "2026-09-19-lex",
      date: "2026-09-19",
      slug: "lex",
      files: [
        { name: "note.md", present: false, bytes: null },
        { name: "transcript.md", present: true, bytes: 29000 },
      ],
    },
  ],
};

const NO_FOLDER: ProjectVault = {
  projectId: "english-companion",
  exists: false,
  relativePath: "vault/10-Projects/english-companion",
  contextFile: false,
  meetings: [],
};

const EMPTY_FOLDER: ProjectVault = {
  projectId: "choda-deck",
  exists: true,
  relativePath: "vault/10-Projects/choda-deck",
  contextFile: true,
  meetings: [],
};

let reply: { status: number; body: unknown } = { status: 200, body: WITH_MEETINGS };
let copiedText: string | null = null;

beforeEach(() => {
  reply = { status: 200, body: WITH_MEETINGS };
  copiedText = null;
  vi.stubGlobal("navigator", {
    ...navigator,
    clipboard: {
      writeText: async (t: string) => {
        copiedText = t;
      },
    },
  });
  vi.stubGlobal("fetch", async (input: RequestInfo) => {
    const url = String(input);
    if (url.includes("/api/vault/projects/")) {
      return new Response(JSON.stringify(reply.body), {
        status: reply.status,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("{}", { status: 404 });
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function mount(projectId = "juvenis-maxime"): Promise<void> {
  render(<ProjectVaultBlock projectId={projectId} />);
  // Wait on the Skeleton's own test id. Its `label` is sr-only TEXT, not an
  // aria-label, so waiting on getByLabelText would resolve instantly against
  // nothing and the helper would not be waiting at all.
  await waitFor(() => expect(screen.queryByTestId("skeleton")).toBeNull());
}

describe("a project with a vault folder", () => {
  // AC-1
  it("shows the folder path and its meetings", async () => {
    await mount();
    expect(screen.getByTestId("vault-path")).toHaveTextContent("vault/10-Projects/juvenis-maxime");
    const list = screen.getByTestId("vault-meetings");
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByTestId("vault-meeting-2026-09-20-kate")).toBeInTheDocument();
  });

  // AC-4
  it("distinguishes context.md present from absent", async () => {
    await mount();
    expect(screen.getByTestId("context-absent")).toBeInTheDocument();
    expect(screen.queryByTestId("context-present")).toBeNull();

    cleanup();
    reply = { status: 200, body: EMPTY_FOLDER };
    await mount("choda-deck");
    expect(screen.getByTestId("context-present")).toBeInTheDocument();
    expect(screen.queryByTestId("context-absent")).toBeNull();
  });
});

// AC-3
describe("a meeting whose note was never saved", () => {
  it("shows the missing file rather than omitting it", async () => {
    reply = { status: 200, body: MISSING_NOTE };
    await mount("headless-cms");

    // The row exists at all...
    expect(screen.getByTestId("vault-meeting-2026-09-19-lex")).toBeInTheDocument();
    // ...and names the absence.
    expect(screen.getByTestId("file-chip-2026-09-19-lex-note.md")).toHaveTextContent("no note.md");
    expect(screen.getByTestId("file-chip-2026-09-19-lex-transcript.md")).toHaveTextContent(
      "transcript.md",
    );
  });

  it("says 'never saved' instead of a size when the row is expanded", async () => {
    reply = { status: 200, body: MISSING_NOTE };
    await mount("headless-cms");
    fireEvent.click(screen.getByTestId("vault-meeting-2026-09-19-lex"));

    const body = screen.getByTestId("vault-meeting-body-2026-09-19-lex");
    expect(body.textContent).toContain("never saved");
    expect(body.textContent).toContain("28 KB");
  });
});

// AC-2 — the discriminating pair
describe("no folder versus an empty folder", () => {
  it("names 'nothing saved yet' and the path that would be created", async () => {
    reply = { status: 200, body: NO_FOLDER };
    await mount("english-companion");

    expect(screen.getByTestId("vault-absent")).toBeInTheDocument();
    expect(screen.getByTestId("vault-absent").textContent).toContain(
      "vault/10-Projects/english-companion",
    );
    // The other shape is absent.
    expect(screen.queryByTestId("vault-present")).toBeNull();
    expect(screen.queryByTestId("vault-no-meetings")).toBeNull();
  });

  it("renders an existing folder with zero meetings differently", async () => {
    reply = { status: 200, body: EMPTY_FOLDER };
    await mount("choda-deck");

    expect(screen.getByTestId("vault-present")).toBeInTheDocument();
    expect(screen.getByTestId("vault-no-meetings")).toBeInTheDocument();
    // ...and it is NOT the absent state, even though both have zero meetings.
    expect(screen.queryByTestId("vault-absent")).toBeNull();
  });
});

describe("collapse and expand", () => {
  // AC-5
  it("collapses the whole block", async () => {
    await mount();
    const body = screen.getByTestId("vault-block-body");
    expect(body.hidden).toBe(false);

    fireEvent.click(screen.getByTestId("vault-block-toggle"));
    await waitFor(() => expect(screen.getByTestId("vault-block-body").hidden).toBe(true));
  });

  // AC-5
  it("expands one meeting to its full folder path and a row per file", async () => {
    await mount();
    fireEvent.click(screen.getByTestId("vault-meeting-2026-09-20-kate"));

    const body = screen.getByTestId("vault-meeting-body-2026-09-20-kate");
    expect(body.textContent).toContain("vault/10-Projects/juvenis-maxime/meetings/2026-09-20-kate");
    expect(body.textContent).toContain("note.md");
    expect(body.textContent).toContain("transcript.md");
    expect(body.textContent).toContain("33 KB");

    // Opening one row does not open its sibling.
    expect(screen.queryByTestId("vault-meeting-body-2026-09-17-chi-kate-v3")).toBeNull();
  });

  // AC-6 — the one that must not be faked with a call count
  it("hides a collapsed meeting body without unmounting it", async () => {
    await mount();
    const toggle = screen.getByTestId("vault-meeting-2026-09-20-kate");

    fireEvent.click(toggle);
    const first = screen.getByTestId("vault-meeting-body-2026-09-20-kate");
    expect(first.hidden).toBe(false);
    // Mark the live node. A remount discards this; a hide keeps it.
    first.setAttribute("data-marked", "yes");

    fireEvent.click(toggle);
    await waitFor(() =>
      expect(screen.getByTestId("vault-meeting-body-2026-09-20-kate").hidden).toBe(true),
    );

    fireEvent.click(toggle);
    const again = screen.getByTestId("vault-meeting-body-2026-09-20-kate");
    expect(again.hidden).toBe(false);
    expect(again).toBe(first);
    expect(again.getAttribute("data-marked")).toBe("yes");
  });

  // AC-7
  it("Expand all opens every meeting, and the label follows the state it produced", async () => {
    await mount();
    const all = screen.getByTestId("vault-expand-all");
    expect(all).toHaveTextContent("Expand all");

    fireEvent.click(all);
    await waitFor(() =>
      expect(screen.getByTestId("vault-meeting-body-2026-09-20-kate").hidden).toBe(false),
    );
    expect(screen.getByTestId("vault-meeting-body-2026-09-17-chi-kate-v3").hidden).toBe(false);
    expect(all).toHaveTextContent("Collapse all");

    fireEvent.click(all);
    await waitFor(() =>
      expect(screen.getByTestId("vault-meeting-body-2026-09-20-kate").hidden).toBe(true),
    );
    expect(screen.getByTestId("vault-expand-all")).toHaveTextContent("Expand all");
  });

  // AC-7 — the label is derived, so a hand-toggled row cannot desync it
  it("still offers Expand all after one row was opened by hand", async () => {
    await mount();
    fireEvent.click(screen.getByTestId("vault-meeting-2026-09-20-kate"));
    // One of two open — not all — so the control must still say Expand all.
    expect(screen.getByTestId("vault-expand-all")).toHaveTextContent("Expand all");

    fireEvent.click(screen.getByTestId("vault-expand-all"));
    await waitFor(() =>
      expect(screen.getByTestId("vault-meeting-body-2026-09-17-chi-kate-v3").hidden).toBe(false),
    );
  });

  // AC-8 — Expand all must not remount either
  it("Expand all does not unmount an already-open body", async () => {
    await mount();
    const toggle = screen.getByTestId("vault-meeting-2026-09-20-kate");
    fireEvent.click(toggle);
    const node = screen.getByTestId("vault-meeting-body-2026-09-20-kate");
    node.setAttribute("data-marked", "yes");

    fireEvent.click(screen.getByTestId("vault-expand-all"));
    await waitFor(() =>
      expect(screen.getByTestId("vault-meeting-body-2026-09-17-chi-kate-v3").hidden).toBe(false),
    );
    expect(screen.getByTestId("vault-meeting-body-2026-09-20-kate").getAttribute("data-marked")).toBe(
      "yes",
    );
  });
});

// AC-8
describe("copy path", () => {
  it("copies the folder path", async () => {
    await mount();
    fireEvent.click(screen.getByLabelText("Copy path vault/10-Projects/juvenis-maxime"));
    await waitFor(() => expect(copiedText).toBe("vault/10-Projects/juvenis-maxime"));
  });

  it("copies a single file's path", async () => {
    await mount();
    fireEvent.click(screen.getByTestId("vault-meeting-2026-09-20-kate"));
    const body = screen.getByTestId("vault-meeting-body-2026-09-20-kate");
    fireEvent.click(within(body).getByLabelText("Copy path note.md"));

    await waitFor(() =>
      expect(copiedText).toBe(
        "vault/10-Projects/juvenis-maxime/meetings/2026-09-20-kate/note.md",
      ),
    );
  });

  it("offers no copy control for a file that is not there", async () => {
    reply = { status: 200, body: MISSING_NOTE };
    await mount("headless-cms");
    fireEvent.click(screen.getByTestId("vault-meeting-2026-09-19-lex"));

    const body = screen.getByTestId("vault-meeting-body-2026-09-19-lex");
    expect(within(body).queryByLabelText("Copy path note.md")).toBeNull();
    expect(within(body).getByLabelText("Copy path transcript.md")).toBeInTheDocument();
  });
});

// AC-9 / AC-10
describe("degraded adapters", () => {
  it("reports itself unavailable on a 404, without claiming the project is empty", async () => {
    reply = { status: 404, body: { error: "not found" } };
    await mount();

    expect(screen.getByTestId("capability-note")).toBeInTheDocument();
    // Not mistaken for "nothing saved here yet", which is a claim about the
    // vault rather than about this build.
    expect(screen.queryByTestId("vault-absent")).toBeNull();
    expect(screen.queryByTestId("vault-present")).toBeNull();
  });

  it("uses the shared ErrorState on a server failure", async () => {
    reply = { status: 500, body: { error: "boom" } };
    await mount();
    expect(screen.getByTestId("error-state")).toBeInTheDocument();
    expect(screen.queryByTestId("vault-absent")).toBeNull();
  });

  it("uses the shared Skeleton while loading", () => {
    render(<ProjectVaultBlock projectId="juvenis-maxime" />);
    const sk = screen.getByTestId("skeleton");
    expect(sk).toBeInTheDocument();
    // The shared component, not a hand-rolled one: it carries the busy role
    // and its own sr-only label.
    expect(sk).toHaveAttribute("aria-busy", "true");
    expect(sk.textContent).toContain("Loading vault folder");
  });
});
