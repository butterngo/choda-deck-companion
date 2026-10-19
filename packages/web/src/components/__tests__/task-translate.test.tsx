// TASK-2537 — the translate button on TaskDetailPanel, over POST
// /tasks/translate (TASK-2536). fetch is stubbed and every call recorded, so the
// "never on open, once per click" rule is read from the requests themselves.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { TaskDetail } from "../../api";
import { TaskDetailPanel } from "../TaskDetailPanel";
import { NodeDetailDrawer } from "../NodeDetailDrawer";

const TASK: TaskDetail = {
  id: "TASK-1",
  projectId: "p",
  parentTaskId: null,
  title: "Emit events to the platform",
  status: "TODO",
  priority: "medium",
  labels: [],
  body: "## Context\n\nWrite the row.",
  blockedBy: [],
};

interface Call {
  method: string;
  url: string;
  body: unknown;
}
let calls: Call[] = [];
let reply: () => Promise<Response> = async () => new Response("{}");

const json = (status: number, b: unknown): Response =>
  new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });

function serve(): void {
  vi.stubGlobal("fetch", async (input: RequestInfo, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ method, url, body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined });
    if (url.endsWith("/tasks/translate")) return reply();
    if (url.includes("/tasks/TASK-1")) return json(200, TASK);
    return json(200, {});
  });
}

const translateCalls = (): Call[] => calls.filter((c) => c.url.endsWith("/tasks/translate"));

const translated = (cached: boolean) => async (): Promise<Response> =>
  json(200, { taskId: "TASK-1", title: "Tiêu đề", body: "## Bối cảnh\n\nGhi dòng.", sourceHash: "h", cached, model: "gpt-4.1-mini" });

function wrap(children: React.ReactNode): React.JSX.Element {
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

function mount(): void {
  serve();
  render(wrap(<TaskDetailPanel task={TASK} />));
}

const button = (): HTMLElement => screen.getByRole("button", { name: /Dịch sang tiếng Việt/ });

afterEach(() => {
  vi.unstubAllGlobals();
  calls = [];
});

describe("translate button on TaskDetailPanel", () => {
  it("AC-1: rendering the panel makes zero requests to /tasks/translate", () => {
    mount();
    expect(button()).toBeTruthy();
    expect(translateCalls()).toHaveLength(0);
  });

  it("AC-2: clicking sends exactly one POST with {taskId}", async () => {
    reply = translated(false);
    mount();
    fireEvent.click(button());
    await screen.findByText("Tiêu đề");
    expect(translateCalls()).toEqual([{ method: "POST", url: expect.stringMatching(/\/tasks\/translate$/), body: { taskId: "TASK-1" } }]);
  });

  it("AC-3: while pending, the button is disabled and reads Translating…", async () => {
    let release: (r: Response) => void = () => {};
    reply = () => new Promise<Response>((r) => (release = r));
    mount();
    fireEvent.click(button());
    const pending = await screen.findByRole("button", { name: /Translating…/ });
    expect((pending as HTMLButtonElement).disabled).toBe(true);
    release(await translated(false)());
    await screen.findByText("Tiêu đề");
  });

  it("AC-4/AC-5/AC-6: a 200 swaps in the Vietnamese title and rendered body", async () => {
    reply = translated(false);
    mount();
    fireEvent.click(button());
    expect(await screen.findByText("Tiêu đề")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Bối cảnh" })).toBeTruthy();
    expect(screen.queryByText(TASK.title)).toBeNull();
  });

  it("AC-7/AC-8: Show original brings the English title back without a new request", async () => {
    reply = translated(false);
    mount();
    fireEvent.click(button());
    await screen.findByText("Tiêu đề");
    fireEvent.click(screen.getByRole("button", { name: /Show original/ }));
    expect(screen.getByText(TASK.title)).toBeTruthy();
    expect(translateCalls()).toHaveLength(1);
  });

  it("AC-9: a cached answer says cached in the status bar", async () => {
    reply = translated(true);
    mount();
    fireEvent.click(button());
    expect((await screen.findByTestId("translate-status")).textContent).toContain("cached");
  });

  it("AC-10: a fresh answer shows a status bar without the word cached", async () => {
    reply = translated(false);
    mount();
    fireEvent.click(button());
    expect((await screen.findByTestId("translate-status")).textContent).not.toContain("cached");
  });

  it("AC-11: a 501 says Azure AI Foundry is not set up, linking to #/secrets", async () => {
    reply = async () => json(501, { error: "no model configured" });
    mount();
    fireEvent.click(button());
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Azure AI Foundry is not set up");
    expect(screen.getByRole("link", { name: "Secrets" }).getAttribute("href")?.endsWith("#/secrets")).toBe(true);
  });

  it("AC-12/AC-13: a mangled 502 says why and keeps the English title", async () => {
    reply = async () => json(502, { error: "translation dropped code", kind: "mangled" });
    mount();
    fireEvent.click(button());
    expect((await screen.findByRole("alert")).textContent).toContain("Could not translate: translation dropped code");
    expect(screen.getByText(TASK.title)).toBeTruthy();
  });

  it("AC-14: the graph drawer showing a task node renders the button", async () => {
    serve();
    render(wrap(<NodeDetailDrawer node={{ id: "TASK-1", type: "task" }} onClose={() => {}} />));
    await waitFor(() => expect(screen.getByRole("button", { name: /Dịch sang tiếng Việt/ })).toBeTruthy());
  });
});
