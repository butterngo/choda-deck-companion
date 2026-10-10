import type { Page, Route } from "@playwright/test";

// TASK-2355 — a fake laptop adapter for e2e. Answers the routes a flow needs
// and lets everything else 404, so a spec states its own fixtures and an
// unexpected call shows up as a failed request rather than real data.

export type Fixtures = Record<string, unknown>;

/** Mock /api/<path> → JSON. Keys are adapter paths with the query string, e.g. "/search?q=x". */
export async function mockAdapter(page: Page, fixtures: Fixtures): Promise<void> {
  const routes: Fixtures = {
    "/sync/health": { loopAlive: true, lastPullAgeSec: 1, jwtState: "none", reachable: true },
    ...fixtures,
  };
  await page.route("**/api/**", (route: Route) => {
    const url = new URL(route.request().url());
    const key = url.pathname.replace(/^\/api/, "") + url.search;
    const body = routes[key] ?? routes[url.pathname.replace(/^\/api/, "")];
    if (body === undefined) return route.fulfill({ status: 404, json: { error: `unmocked ${key}` } });
    return route.fulfill({ status: 200, json: body });
  });
}
