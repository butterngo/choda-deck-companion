import { expect, test } from "@playwright/test";
import { mockAdapter } from "./adapter-mock";

// TASK-2355 — the first companion e2e, and the flow the improve loop measures
// (`flow:search-to-task`, TASK-2356): find a task by searching, then open it.
//
// A search hit's own button opens the GRAPH (`/graph?project=…&node=…`), so the
// "open the task" step goes to the task's page, `/tasks/:id`, the way a link
// from anywhere else in the app does.

const TASK = {
  id: "TASK-4242",
  projectId: "choda-deck",
  parentTaskId: null,
  title: "Tighten the projects page header",
  status: "READY",
  priority: "medium",
  labels: [],
  body: "## Context\nx",
  blockedBy: [],
};

test("search for a task, then open it", async ({ page }) => {
  await mockAdapter(page, {
    "/search?q=header": {
      query: "header",
      tasks: [{ kind: "task", id: TASK.id, title: TASK.title, projectId: TASK.projectId, status: TASK.status }],
      knowledge: [],
      knowledgeEnabled: true,
      knowledgeReason: null,
    },
    [`/tasks/${TASK.id}`]: TASK,
  });

  const started = Date.now();
  let steps = 0;

  await page.goto("/#/search");
  steps++;
  await page.getByLabel("search query").fill("header");
  steps++;
  await page.getByRole("button", { name: "Search", exact: true }).click();
  steps++;

  const hit = page.locator("[data-hit]").first();
  await expect(hit).toContainText(TASK.title);

  await page.goto(`/#/tasks/${TASK.id}`);
  steps++;
  await expect(page.getByText(TASK.title, { exact: true })).toBeVisible();

  test.info().annotations.push(
    { type: "duration-ms", description: String(Date.now() - started) },
    { type: "steps", description: String(steps) },
  );
});
