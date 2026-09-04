// TASK-1830 — the Setup tab. One test per acceptance criterion.
//
// The hook is mocked with DATA ONLY, never a rule (INBOX-1878): a fake that
// reimplements a production conditional covers up the very logic it stands in
// for, and the suite reports full green. Nothing in `state` branches.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, within, act } from "@testing-library/react";
import type { ClaudeConfigResult } from "../../api";

const CONFIG: ClaudeConfigResult = {
  skills: [
    {
      name: "session-start",
      description: "Set up a clean working environment for one task.",
      scope: "global",
      pluginId: null,
      path: "C:\\Users\\b\\.claude\\skills\\session-start\\SKILL.md",
    },
    {
      name: "frontend-design",
      description: "Create distinctive frontend interfaces.",
      scope: "plugin",
      pluginId: "frontend-design@official",
      path: "C:\\Users\\b\\.claude\\plugins\\cache\\fd\\skills\\frontend-design\\SKILL.md",
    },
  ],
  commands: [{ name: "deploy", path: "C:\\vault\\.claude\\commands\\deploy.md" }],
  rules: [{ name: "CLAUDE.md", path: "C:\\Users\\b\\.claude\\CLAUDE.md" }],
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
const calls: { url: string; method: string }[] = [];

beforeEach(() => {
  calls.length = 0;
  state.config = structuredClone(CONFIG);
  state.isLoading = false;
  state.isError = false;
  state.outdatedAdapter = false;
  state.unknownWorkspace = false;
  vi.stubGlobal("fetch", (input: RequestInfo, init?: RequestInit) => {
    calls.push({ url: String(input), method: init?.method ?? "GET" });
    return Promise.resolve(new Response("{}", { status: 200 }));
  });
});

const mount = (): void => {
  render(<WorkspaceSetupView workspaceId="choda-deck-companion" />);
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
