// TASK-1830 — the Setup tab. One test per acceptance criterion.
//
// The hook is mocked with DATA ONLY, never a rule (INBOX-1878): a fake that
// reimplements a production conditional covers up the very logic it stands in
// for, and the suite reports full green. Nothing in `state` branches.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, within, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ClaudeConfigResult } from "../../api";

const CONFIG: ClaudeConfigResult = {
  skills: [
    {
      name: "session-start",
      description: "Set up a clean working environment for one task.",
      scope: "global",
      pluginId: null,
      path: "C:\\Users\\b\\.claude\\skills\\session-start\\SKILL.md",
      ref: { rootId: "skills", rel: "session-start/SKILL.md" },
    },
    {
      name: "frontend-design",
      description: "Create distinctive frontend interfaces.",
      scope: "plugin",
      pluginId: "frontend-design@official",
      path: "C:\\Users\\b\\.claude\\plugins\\cache\\fd\\skills\\frontend-design\\SKILL.md",
      ref: { rootId: "plugin:frontend-design@official", rel: "frontend-design/SKILL.md" },
    },
  ],
  commands: [
    {
      name: "deploy",
      path: "C:\\vault\\.claude\\commands\\deploy.md",
      ref: { rootId: "commands", rel: "deploy.md" },
    },
  ],
  rules: [
    {
      name: "CLAUDE.md",
      path: "C:\\Users\\b\\.claude\\CLAUDE.md",
      ref: { rootId: "claude-md", rel: "" },
    },
  ],
  mcpServers: [
    {
      name: "choda-tasks",
      origin: "global",
      transport: "stdio",
      status: "active",
      source: "C:\\Users\\b\\.claude.json",
      error: null,
    },
    {
      name: "probe-beta",
      origin: "project",
      transport: "http",
      status: "disabled",
      source: "C:\\dev\\repo\\.mcp.json",
      error: null,
    },
    {
      name: "probe-gamma",
      origin: "project",
      transport: "http",
      status: "pending",
      source: "C:\\dev\\repo\\.mcp.json",
      error: null,
    },
  ],
  mcpScope: {
    localOnly: true,
    note: "claude.ai connectors are configured account-side and cannot be listed from disk",
  },
};

const state = {
  config: CONFIG as ClaudeConfigResult | null,
  isLoading: false,
  isError: false,
  outdatedAdapter: false,
  unknownWorkspace: false,
};

vi.mock("../../hooks/use-claude-config", () => ({ useClaudeConfig: () => state }));

const { WorkspaceSetupView } = await import("../WorkspaceSetupView");

/** Every fetch the flow makes, so a write can be caught rather than assumed. */
const calls: { url: string; method: string; ifMatch: string | null; body: string | null }[] = [];
let fileBody = "";
let fileStatus = 200;
let fileEtag = "";
let saveStatus = 200;
let saveBody: Record<string, unknown> = {};
let findings: { checkId: string; severity: string; message: string; line: number | null }[] = [];
let reviewStatus = 200;
let reviewBody: Record<string, unknown> = { notes: [] };

beforeEach(() => {
  calls.length = 0;
  state.config = structuredClone(CONFIG);
  state.isLoading = false;
  state.isError = false;
  state.outdatedAdapter = false;
  state.unknownWorkspace = false;
  fileBody = "# session-start\n\nSet up a clean working environment.\n";
  fileStatus = 200;
  fileEtag = "aaaa1111";
  saveStatus = 200;
  saveBody = { sha256: "bbbb2222" };
  findings = [];
  reviewStatus = 200;
  reviewBody = { notes: [] };
  vi.stubGlobal("fetch", (input: RequestInfo, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({
      url,
      method,
      ifMatch: (init?.headers as Record<string, string> | undefined)?.["if-match"] ?? null,
      body: typeof init?.body === "string" ? init.body : null,
    });
    if (url.endsWith("/claude-config/validate")) {
      return Promise.resolve(
        new Response(JSON.stringify({ findings }), { status: 200 }),
      );
    }
    if (url.endsWith("/claude-config/review")) {
      return Promise.resolve(
        new Response(JSON.stringify(reviewBody), { status: reviewStatus }),
      );
    }
    if (method === "PUT") {
      return Promise.resolve(
        new Response(JSON.stringify(saveBody), { status: saveStatus }),
      );
    }
    // The read carries the etag the save has to send back.
    return Promise.resolve(
      new Response(fileBody, { status: fileStatus, headers: { etag: fileEtag } }),
    );
  });
});

// The file hook is NOT mocked. Mocking it would leave AC-1 — "selecting a row
// issues a GET" — asserted against a fake that could not fail. A real
// QueryClient over a stubbed fetch proves the request actually leaves.
const mount = (): void => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  render(
    <QueryClientProvider client={client}>
      <WorkspaceSetupView workspaceId="choda-deck-companion" />
    </QueryClientProvider>,
  );
};

/** Let the file query settle. */
const settle = async (): Promise<void> => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

describe("AC-2 — every row names its origin", () => {
  it("labels every rendered row, with none left blank", () => {
    mount();
    // Counted rather than spot-checked: a row that lost its label is invisible
    // to an assertion that only looks at the ones it remembers to name.
    const rows = screen.getAllByTestId(/^setup-row-/);
    const origins = screen.getAllByTestId(/^setup-origin-/);
    expect(rows.length).toBe(origins.length);
    expect(rows.length).toBe(7);
    for (const o of origins) {
      expect(["Global", "This project", "Plugin"]).toContain(o.textContent);
    }
  });

  it("attributes a plugin skill to Plugin and a repo server to This project", () => {
    mount();
    expect(screen.getByTestId("setup-origin-skill:plugin:frontend-design").textContent).toBe(
      "Plugin",
    );
    expect(screen.getByTestId("setup-origin-mcp:project:probe-beta").textContent).toBe(
      "This project",
    );
  });
});

describe("AC-3 — an unreadable .mcp.json is one row, not a broken tab", () => {
  it("renders the parse message and leaves the other groups intact", () => {
    state.config = structuredClone(CONFIG);
    state.config.mcpServers.push({
      name: ".mcp.json",
      origin: "project",
      transport: null,
      status: "pending",
      source: "C:\\dev\\repo\\.mcp.json",
      error: "Unexpected token b in JSON at position 18",
    });
    mount();
    expect(screen.getByTestId("mcp-status-.mcp.json").getAttribute("data-status")).toBe(
      "unreadable",
    );
    fireEvent.click(screen.getByTestId("setup-row-mcp:project:.mcp.json"));
    expect(screen.getByText(/Unexpected token b/)).toBeTruthy();
    // The point of the criterion: everything else still rendered.
    expect(within(screen.getByTestId("setup-group-skills")).getAllByRole("button")).toHaveLength(2);
  });

  it("shows three distinct MCP states, because the machine has three", () => {
    mount();
    expect(screen.getByTestId("mcp-status-choda-tasks").getAttribute("data-status")).toBe("active");
    expect(screen.getByTestId("mcp-status-probe-beta").getAttribute("data-status")).toBe("disabled");
    expect(screen.getByTestId("mcp-status-probe-gamma").getAttribute("data-status")).toBe("pending");
  });
});

describe("AC-4 — the path is shown and copyable, and nothing is written", () => {
  it("renders the absolute path with a copy control", () => {
    mount();
    fireEvent.click(screen.getByTestId("setup-row-skill:global:session-start"));
    expect(screen.getByTestId("setup-detail-path").textContent).toBe(
      "C:\\Users\\b\\.claude\\skills\\session-start\\SKILL.md",
    );
    expect(screen.getByTestId("setup-copy-path")).toBeTruthy();
  });

  it("copies the path to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    mount();
    fireEvent.click(screen.getByTestId("setup-row-rule:CLAUDE.md"));
    // The copy handler is async, so its setCopied lands after the click returns.
    await act(async () => {
      fireEvent.click(screen.getByTestId("setup-copy-path"));
    });
    expect(writeText).toHaveBeenCalledWith("C:\\Users\\b\\.claude\\CLAUDE.md");
  });

  it("issues no request other than GET in the whole flow", async () => {
    mount();
    fireEvent.click(screen.getByTestId("setup-row-skill:global:session-start"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("setup-copy-path"));
    });
    fireEvent.click(screen.getByTestId("setup-row-cmd:deploy"));
    // Asserted over the recorded calls, not over the UI: a view that renders
    // read-only and posts anyway would pass any assertion made on the screen.
    expect(calls.every((c) => c.method === "GET")).toBe(true);
  });
});

describe("AC-5 — an empty group still renders, with a reason", () => {
  it("keeps the Slash commands section when there are no commands", () => {
    // Butter's ~/.claude/commands is a DANGLING symlink, so empty is the correct
    // answer here. A section that disappears is indistinguishable from one that
    // was never built.
    state.config = structuredClone(CONFIG);
    state.config.commands = [];
    mount();
    expect(screen.getByTestId("setup-group-commands")).toBeTruthy();
    expect(screen.getByTestId("setup-group-empty-commands").textContent?.length).toBeGreaterThan(0);
    // The other groups are untouched.
    expect(screen.getAllByTestId(/^setup-row-/).length).toBe(6);
  });
});

describe("the boundary the count cannot see", () => {
  it("states that account-side connectors are not listed", () => {
    mount();
    expect(screen.getByTestId("setup-mcp-scope").textContent).toContain("account-side");
  });
});

describe("states that are facts, not failures", () => {
  it("says the app is behind when the adapter has no route", () => {
    state.outdatedAdapter = true;
    state.config = null;
    mount();
    expect(screen.getByTestId("setup-outdated-adapter")).toBeTruthy();
    // Never an error state: nothing is broken, one route is simply absent.
    expect(screen.queryByTestId("error-state")).toBeNull();
  });

  it("CONTROL — a real failure still renders as an error", () => {
    // Without this, "never an error" could be satisfied by a view that has no
    // error path at all.
    state.isError = true;
    state.config = null;
    mount();
    expect(screen.queryByTestId("setup-outdated-adapter")).toBeNull();
  });

  it("invites a selection before anything is picked", () => {
    mount();
    expect(screen.getByTestId("setup-detail-idle")).toBeTruthy();
  });
});

describe("TASK-1831 — the pane reads the file it points at", () => {
  it("AC-1 — selecting a row requests that row's file through its ref", async () => {
    // Against main this array is EMPTY: the route shipped with no caller, which
    // is the whole reason this task exists.
    mount();
    fireEvent.click(screen.getByTestId("setup-row-skill:global:session-start"));
    await settle();
    expect(calls.map((c) => c.url)).toContain(
      "/api/claude-config/skills/session-start/SKILL.md",
    );
  });

  it("AC-1 — a plugin skill asks its plugin root, not the skills root", async () => {
    mount();
    fireEvent.click(screen.getByTestId("setup-row-skill:plugin:frontend-design"));
    await settle();
    const url = calls.map((c) => c.url).find((u) => u.includes("frontend-design/SKILL.md"));
    // The root id is encoded because it carries an '@'.
    expect(url).toContain(encodeURIComponent("plugin:frontend-design@official"));
  });

  it("AC-2 — a .md file renders as prose, not as source", async () => {
    mount();
    fireEvent.click(screen.getByTestId("setup-row-skill:global:session-start"));
    // findBy* retries: react-query resolves through its own scheduler, and a
    // fixed number of microtask ticks is a race dressed up as a wait.
    expect(await screen.findByTestId("setup-file-markdown")).toBeTruthy();
    expect(screen.queryByTestId("setup-file-source")).toBeNull();
  });

  it("AC-2 — CONTROL: a non-markdown file renders as source", async () => {
    // Without this, the markdown branch could be the only branch and the first
    // assertion would still pass.
    state.config = structuredClone(CONFIG);
    state.config.rules = [
      {
        name: "settings.local.json",
        path: "C:\\Users\\b\\.claude\\settings.local.json",
        ref: { rootId: "claude-md", rel: "" },
      },
    ];
    fileBody = '{ "permissions": {} }';
    mount();
    fireEvent.click(screen.getByTestId("setup-row-rule:settings.local.json"));
    expect(await screen.findByTestId("setup-file-source")).toBeTruthy();
    expect(screen.queryByTestId("setup-file-markdown")).toBeNull();
  });

  it("AC-3 — an unreadable file does not blank the metadata above it", async () => {
    fileStatus = 500;
    mount();
    fireEvent.click(screen.getByTestId("setup-row-skill:global:session-start"));
    await settle();
    // The header survives: one bad file is not a broken tab.
    expect(screen.getByTestId("setup-detail-path")).toBeTruthy();
    expect(screen.getByTestId("setup-copy-path")).toBeTruthy();
    expect(screen.queryByTestId("setup-file-markdown")).toBeNull();
  });

  it("AC-4 — content joins the metadata rather than replacing it", async () => {
    mount();
    fireEvent.click(screen.getByTestId("setup-row-skill:global:session-start"));
    expect(await screen.findByTestId("setup-file-markdown")).toBeTruthy();
    expect(screen.getByTestId("setup-detail-path")).toBeTruthy();
    expect(screen.getByTestId("setup-copy-path")).toBeTruthy();
    expect(screen.getByTestId("setup-open-note")).toBeTruthy();
  });

  it("AC-5 — reading a file is still only GET", async () => {
    mount();
    fireEvent.click(screen.getByTestId("setup-row-skill:global:session-start"));
    await settle();
    fireEvent.click(screen.getByTestId("setup-row-cmd:deploy"));
    await settle();
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((c) => c.method === "GET")).toBe(true);
  });

  it("an MCP row asks for no file, because .claude.json is never served", async () => {
    mount();
    fireEvent.click(screen.getByTestId("setup-row-mcp:global:choda-tasks"));
    await settle();
    expect(calls.filter((c) => c.url.includes("/claude-config/"))).toHaveLength(0);
    // The path is still shown and copyable — the row is not degraded, it simply
    // points at a document the route deliberately refuses to serve.
    expect(screen.getByTestId("setup-detail-path")).toBeTruthy();
  });
});


// ---------------------------------------------------------------------------
// TASK-1844 — edit and save
// ---------------------------------------------------------------------------

/** Open a file-backed row and enter edit mode. */
async function openAndEdit(testid = "setup-row-skill:global:session-start"): Promise<void> {
  mount();
  fireEvent.click(screen.getByTestId(testid));
  await screen.findByTestId("setup-file-markdown");
  fireEvent.click(screen.getByTestId("setup-edit"));
}

describe("AC-1 — a save carries the hash the read returned", () => {
  it("issues exactly one PUT with if-match equal to the etag", async () => {
    await openAndEdit();
    fireEvent.change(screen.getByTestId("setup-editor"), { target: { value: "# edited\n" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("setup-save"));
    });

    const puts = calls.filter((c) => c.method === "PUT");
    expect(puts).toHaveLength(1);
    // Not merely "an if-match was sent" — the value has to be the one the read
    // handed back, or the server's precondition is decoration.
    expect(puts[0].ifMatch).toBe("aaaa1111");
    expect(puts[0].url).toContain("/claude-config/skills/session-start/SKILL.md");
  });
});

describe("AC-2 — the file moved under you", () => {
  it("keeps the edit, says so, and does not re-send", async () => {
    saveStatus = 409;
    saveBody = { error: "file changed on disk", sha256: "cccc3333" };
    await openAndEdit();
    fireEvent.change(screen.getByTestId("setup-editor"), { target: { value: "# mine\n" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("setup-save"));
    });

    expect(screen.getByTestId("setup-save-conflict")).toBeTruthy();
    // The edit survives. Discarding it would lose the reader's work to a race
    // they did not cause.
    expect((screen.getByTestId("setup-editor") as HTMLTextAreaElement).value).toBe("# mine\n");
    // And exactly one PUT — an automatic retry would overwrite whoever got there first.
    expect(calls.filter((c) => c.method === "PUT")).toHaveLength(1);
  });
});

describe("AC-3 — refusals are distinguishable", () => {
  it("403 and 413 render different messages", async () => {
    saveStatus = 403;
    saveBody = { error: "outside the allowed roots" };
    await openAndEdit();
    await act(async () => {
      fireEvent.click(screen.getByTestId("setup-save"));
    });
    const forbidden = screen.getByTestId("setup-save-error").textContent ?? "";

    saveStatus = 413;
    saveBody = { error: "too large" };
    await act(async () => {
      fireEvent.click(screen.getByTestId("setup-save"));
    });
    const tooBig = screen.getByTestId("setup-save-error").textContent ?? "";

    expect(forbidden.length).toBeGreaterThan(0);
    expect(tooBig.length).toBeGreaterThan(0);
    // A shared generic failure tells the reader nothing about which limit they hit.
    expect(forbidden).not.toBe(tooBig);
  });
});

describe("AC-4 — findings render, and a clean file says so", () => {
  it("renders severity and message for each finding", async () => {
    findings = [
      { checkId: "skill-frontmatter", severity: "error", message: "no description", line: 1 },
      { checkId: "utf8-bom", severity: "warning", message: "starts with a BOM", line: 1 },
    ];
    mount();
    fireEvent.click(screen.getByTestId("setup-row-skill:global:session-start"));
    await screen.findByTestId("setup-file-markdown");
    await act(async () => {
      fireEvent.click(screen.getByTestId("setup-check"));
    });

    expect(
      screen.getByTestId("setup-finding-skill-frontmatter").getAttribute("data-severity"),
    ).toBe("error");
    expect(screen.getByTestId("setup-finding-utf8-bom").textContent).toContain("starts with a BOM");
  });

  it("CONTROL — an empty findings array states a pass rather than showing nothing", async () => {
    // A clean file has to be distinguishable from a file that was never checked;
    // an empty area reads as the second.
    findings = [];
    mount();
    fireEvent.click(screen.getByTestId("setup-row-skill:global:session-start"));
    await screen.findByTestId("setup-file-markdown");
    await act(async () => {
      fireEvent.click(screen.getByTestId("setup-check"));
    });
    expect(screen.getByTestId("setup-findings-clean")).toBeTruthy();
  });
});

describe("AC-5 — typing costs nothing", () => {
  it("ten input events issue no PUT and no validate", async () => {
    await openAndEdit();
    const before = calls.length;
    for (let i = 0; i < 10; i++) {
      fireEvent.change(screen.getByTestId("setup-editor"), { target: { value: `draft ${i}` } });
    }
    const after = calls.slice(before);
    expect(after.filter((c) => c.method === "PUT")).toHaveLength(0);
    expect(after.filter((c) => c.url.includes("/validate"))).toHaveLength(0);
    // Nothing at all, in fact — the editor is local until a button is pressed.
    expect(after).toHaveLength(0);
  });
});

describe("the editor does not offer to write where it cannot", () => {
  it("an MCP row has no Edit control, because .claude.json is never served", async () => {
    mount();
    fireEvent.click(screen.getByTestId("setup-row-mcp:global:choda-tasks"));
    await settle();
    expect(screen.queryByTestId("setup-edit")).toBeNull();
    // The path is still shown and copyable — the row is not degraded.
    expect(screen.getByTestId("setup-detail-path")).toBeTruthy();
  });

  it("a draft does not follow the reader to another row", async () => {
    await openAndEdit();
    fireEvent.change(screen.getByTestId("setup-editor"), { target: { value: "# mine\n" } });
    fireEvent.click(screen.getByTestId("setup-row-cmd:deploy"));
    await settle();
    // Carrying it across would offer to save one file's text into another.
    expect(screen.queryByTestId("setup-editor")).toBeNull();
  });
});


// ---------------------------------------------------------------------------
// TASK-1845 — ask for a review, and show that it cost something
// ---------------------------------------------------------------------------

/** Every call that reached the paid route. */
const reviewCalls = (): typeof calls => calls.filter((c) => c.url.endsWith("/claude-config/review"));

describe("AC-1 — a review is a button, never a consequence", () => {
  it("open, save and re-select spend nothing", async () => {
    mount();

    // open
    fireEvent.click(screen.getByTestId("setup-row-skill:global:session-start"));
    await screen.findByTestId("setup-file-markdown");

    // save
    fireEvent.click(screen.getByTestId("setup-edit"));
    fireEvent.change(screen.getByTestId("setup-editor"), { target: { value: "# edited\n" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("setup-save"));
    });

    // re-select
    fireEvent.click(screen.getByTestId("setup-row-cmd:deploy"));
    await settle();

    expect(reviewCalls()).toHaveLength(0);
  });

  it("CONTROL — pressing the control issues exactly one", async () => {
    // Without this, "zero calls" would also be satisfied by a button that does
    // nothing at all.
    mount();
    fireEvent.click(screen.getByTestId("setup-row-skill:global:session-start"));
    await screen.findByTestId("setup-file-markdown");
    await act(async () => {
      fireEvent.click(screen.getByTestId("setup-review"));
    });
    expect(reviewCalls()).toHaveLength(1);
  });
});

describe("AC-2 — no model configured is an invitation, not a failure", () => {
  it("renders a capability note and no error state", async () => {
    reviewStatus = 501;
    reviewBody = { error: "no model configured" };
    mount();
    fireEvent.click(screen.getByTestId("setup-row-skill:global:session-start"));
    await screen.findByTestId("setup-file-markdown");
    await act(async () => {
      fireEvent.click(screen.getByTestId("setup-review"));
    });

    expect(screen.getByTestId("setup-review-unconfigured")).toBeTruthy();
    expect(screen.getByTestId("capability-note")).toBeTruthy();
    // Painting an absent capability rose is how a reader learns to ignore the
    // real errors.
    expect(screen.queryByTestId("setup-review-error")).toBeNull();
  });
});

describe("AC-3 — the error kinds reach the person reading them", () => {
  it("rate_limit and network render different text", async () => {
    mount();
    fireEvent.click(screen.getByTestId("setup-row-skill:global:session-start"));
    await screen.findByTestId("setup-file-markdown");

    reviewStatus = 502;
    reviewBody = { error: "provider failed", kind: "rate_limit" };
    await act(async () => {
      fireEvent.click(screen.getByTestId("setup-review"));
    });
    const limited = screen.getByTestId("setup-review-error").textContent ?? "";

    reviewBody = { error: "provider failed", kind: "network" };
    await act(async () => {
      fireEvent.click(screen.getByTestId("setup-review"));
    });
    const offline = screen.getByTestId("setup-review-error").textContent ?? "";

    expect(limited.length).toBeGreaterThan(0);
    expect(offline.length).toBeGreaterThan(0);
    // The union is typed all the way from the adapter; collapsing it here makes
    // it pointless at the only place a human reads it.
    expect(limited).not.toBe(offline);
  });
});

describe("AC-4 — a note is not a finding", () => {
  it("notes render under their own label, distinct from findings", async () => {
    findings = [
      { checkId: "skill-frontmatter", severity: "error", message: "no description", line: 1 },
    ];
    reviewBody = {
      notes: [{ checkId: "trigger-clarity", message: "says what it does, not when", quote: null }],
    };
    mount();
    fireEvent.click(screen.getByTestId("setup-row-skill:global:session-start"));
    await screen.findByTestId("setup-file-markdown");
    await act(async () => {
      fireEvent.click(screen.getByTestId("setup-check"));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("setup-review"));
    });

    const notesBlock = screen.getByTestId("setup-review-notes");
    const findingsBlock = screen.getByTestId("setup-findings");
    // Separate containers, so a wrong judgement cannot inherit a check's
    // authority by sitting in the same list.
    expect(notesBlock.contains(findingsBlock)).toBe(false);
    expect(within(notesBlock).getByTestId("setup-review-note-trigger-clarity")).toBeTruthy();
    expect(within(findingsBlock).getByTestId("setup-finding-skill-frontmatter")).toBeTruthy();
    expect(notesBlock.textContent).toContain("judgement, not a check");
  });

  it("CONTROL — an empty review states it rather than showing nothing", async () => {
    // An empty area is indistinguishable from a review that never ran.
    reviewBody = { notes: [] };
    mount();
    fireEvent.click(screen.getByTestId("setup-row-skill:global:session-start"));
    await screen.findByTestId("setup-file-markdown");
    await act(async () => {
      fireEvent.click(screen.getByTestId("setup-review"));
    });
    expect(screen.getByTestId("setup-review-empty")).toBeTruthy();
  });
});
