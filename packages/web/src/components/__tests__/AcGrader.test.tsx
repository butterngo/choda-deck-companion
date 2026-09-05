// TASK-1860 AC-5 — grading is a button, never a consequence.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { AcGrader } from "../AcGrader";

const calls: { url: string; method: string; body: string | null }[] = [];
let status = 200;
let body: unknown = { criteria: [] };

beforeEach(() => {
  calls.length = 0;
  status = 200;
  body = { criteria: [] };
  vi.stubGlobal("fetch", (input: RequestInfo, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? init.body : null,
    });
    return Promise.resolve(new Response(JSON.stringify(body), { status }));
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const gradeCalls = (): typeof calls => calls.filter((c) => c.url.endsWith("/tasks/ac-review"));

const press = async (): Promise<void> => {
  await act(async () => {
    fireEvent.click(screen.getByTestId("ac-grade"));
  });
};

describe("AC-5 — grading is a button, never a consequence", () => {
  it("rendering the component spends nothing", () => {
    render(<AcGrader taskId="TASK-1" />);
    // Mounting the task page must not reach a provider. If it did, opening a
    // task would be a purchase.
    expect(gradeCalls()).toHaveLength(0);
  });

  it("CONTROL — pressing the control issues exactly one", async () => {
    // Without this, "zero calls" is also satisfied by a button that does nothing.
    render(<AcGrader taskId="TASK-1" />);
    await press();
    expect(gradeCalls()).toHaveLength(1);
    expect(JSON.parse(gradeCalls()[0].body ?? "{}").taskId).toBe("TASK-1");
  });
});

describe("the states a reader can land in", () => {
  it("501 is an invitation, not an error", async () => {
    status = 501;
    body = { error: "no model configured" };
    render(<AcGrader taskId="TASK-1" />);
    await press();
    expect(screen.getByTestId("ac-unconfigured")).toBeTruthy();
    // Painting an absent capability red teaches the eye to skip the real errors.
    expect(screen.queryByTestId("ac-error")).toBeNull();
  });

  it("404 says there is nothing to grade, and is not an error either", async () => {
    status = 404;
    body = { error: "no acceptance criteria" };
    render(<AcGrader taskId="TASK-1" />);
    await press();
    expect(screen.getByTestId("ac-nothing")).toBeTruthy();
    expect(screen.queryByTestId("ac-error")).toBeNull();
  });

  it("502 kinds read differently", async () => {
    status = 502;
    body = { error: "provider failed", kind: "rate_limit" };
    render(<AcGrader taskId="TASK-1" />);
    await press();
    const limited = screen.getByTestId("ac-error").textContent ?? "";

    body = { error: "provider failed", kind: "budget" };
    await press();
    const budget = screen.getByTestId("ac-error").textContent ?? "";

    expect(limited.length).toBeGreaterThan(0);
    // The union is typed all the way from the adapter; collapsing it here makes
    // it pointless at the only place a person reads it.
    expect(limited).not.toBe(budget);
  });
});

describe("AC-6 — a suggestion is text, never a write", () => {
  it("renders the verdict, concern and suggestion without issuing any write", async () => {
    body = {
      criteria: [
        { index: 0, text: "AC-1 — GET /x returns 200.", verdict: "ok", concern: null, suggestion: null },
        {
          index: 1,
          text: "AC-2 — the handler works correctly.",
          verdict: "weak",
          concern: "names no surface",
          suggestion: "AC-2 — `POST /x` with a malformed body returns 400.",
        },
      ],
    };
    render(<AcGrader taskId="TASK-1" />);
    await press();

    expect(screen.getByTestId("ac-verdict-0").getAttribute("data-verdict")).toBe("ok");
    expect(screen.getByTestId("ac-verdict-1").getAttribute("data-verdict")).toBe("weak");
    expect(screen.getByTestId("ac-concern-1").textContent).toContain("surface");
    expect(screen.getByTestId("ac-suggestion-1").textContent).toContain("malformed body");
    // An ok criterion carries neither, so the two are distinguishable on screen.
    expect(screen.queryByTestId("ac-concern-0")).toBeNull();

    // The whole point: nothing writes the suggestion back. A model editing a
    // spec nobody approved is the outcome this must make impossible.
    expect(calls.filter((c) => c.method !== "GET" && !c.url.endsWith("/tasks/ac-review"))).toHaveLength(0);
    expect(calls.filter((c) => c.method === "PUT" || c.method === "PATCH")).toHaveLength(0);
  });

  it("says how many were flagged, so a clean grade is not silence", async () => {
    body = {
      criteria: [
        { index: 0, text: "a", verdict: "ok", concern: null, suggestion: null },
        { index: 1, text: "b", verdict: "ok", concern: null, suggestion: null },
      ],
    };
    render(<AcGrader taskId="TASK-1" />);
    await press();
    // "2 criteria, none flagged" is a result. An empty area reads as "it did not run".
    expect(screen.getByTestId("ac-summary").textContent).toContain("none flagged");
  });

  it("labels the block as judgement rather than a check", async () => {
    body = { criteria: [{ index: 0, text: "a", verdict: "ok", concern: null, suggestion: null }] };
    render(<AcGrader taskId="TASK-1" />);
    await press();
    // Measured on the live model: it is discriminating but NOT exhaustive — it
    // missed a two-claims-in-one criterion of exactly the kind it catches
    // elsewhere. A `weak` verdict is worth more than an `ok` one, and the label
    // is what stops `ok` reading as a pass.
    expect(screen.getByTestId("ac-verdicts").textContent).toContain("judgement, not a check");
  });
});
