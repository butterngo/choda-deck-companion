// TASK-1767 — a route that renders but cannot be reached is dead code that
// looks alive in the diff, the test run and the release notes.
//
// `TaskDetailView` and `WorkspaceDocsView` shipped in v0.7.0 that way: written,
// tested, reviewed, merged, released, and unreachable the whole time. Every
// test passed because every test rendered the component directly. Rendering a
// view proves it renders; it says nothing about whether a user can arrive.
// router.tsx even carried a comment claiming a task "is a place you can link to
// from a workspace, Search or Graph" — those links were never written, and nothing
// contradicted the comment for three weeks (INBOX-1875).
//
// Test-only. Nothing in the app imports this, so it never reaches the bundle.

/**
 * Remove `//…` and block comments so prose can never be mistaken for code.
 * Deliberately simple: it can mangle a comment marker inside a string literal,
 * which for this guard means at worst a missed link, and a missed link is the
 * direction that FAILS loudly rather than passing quietly.
 */
export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/[^\n]*/g, "$1");
}

/** A route declared in router.tsx, minus the index and wildcard entries. */
export function extractRoutes(routerSource: string): string[] {
  return [...routerSource.matchAll(/path:\s*"([^"]+)"/g)]
    .map((m) => m[1])
    .filter((p): p is string => p !== undefined && p !== "/" && p !== "*");
}

/**
 * Every path a link points at, across all three forms in use:
 *
 *   to="/projects"                                  plain string
 *   to={`/tasks/${encodeURIComponent(id)}`}         template literal
 *   href={`#/workspace-docs?workspaceId=…`}         raw anchor, hash-prefixed
 *
 * The third form matters and is easy to miss: react-router's <Link> adds the
 * `#` itself, but a plain <a> in a hash-routed app has to carry it.
 *
 * An earlier throwaway version of this scan excluded backticks from its
 * character class and therefore could not see form 2 at all. It reported a
 * perfectly reachable route as UNREACHABLE — a false negative in the DETECTOR,
 * which is worse than no detector: it manufactures phantom work and teaches
 * people to distrust the real hits. Hence the per-form fixtures in the tests.
 */
export function extractLinkTargets(source: string): string[] {
  const out: string[] = [];
  // Comments are stripped FIRST, and this is not a tidiness measure — it is
  // load-bearing. Caught by injection: deleting the app's only real link to
  // /tasks/:id left this guard green, because the doc comment a few lines above
  // contains `to={`/tasks/${…}`}` as an EXAMPLE. The guard was reading its own
  // documentation and counting it as a link. Any comment mentioning a route —
  // a TODO, a changelog note, this very paragraph — would do the same.
  const code = stripComments(source);
  for (const m of code.matchAll(/(?:to|href)=\s*\{?\s*[`"']([^`"'\n]*)/g)) {
    const raw = m[1];
    if (raw === undefined) continue;
    // Normalise the hash-routed anchor form onto the router's own vocabulary.
    const target = raw.startsWith("#/") ? raw.slice(1) : raw;
    if (target.startsWith("/")) out.push(target);
  }
  return out;
}

/**
 * A route counts as reached when some link's path starts with its static
 * prefix. `/tasks/:id` is satisfied by `/tasks/${id}` because everything before
 * the first parameter is literal text the link must also contain.
 */
export function isReached(route: string, targets: string[]): boolean {
  const prefix = "/" + route.split("/:")[0];
  return targets.some((t) => t === prefix || t.startsWith(prefix + "/") || t.startsWith(prefix + "?"));
}

export interface ReachabilityReport {
  routes: string[];
  unreachable: string[];
}

/**
 * @param allowlist routes deliberately reachable only by deep link. Each needs
 * a written reason at the call site — an empty allowlist is the goal, and a
 * silently growing one would defeat the whole guard.
 */
export function checkReachability(
  routerSource: string,
  componentSources: string[],
  allowlist: readonly string[] = [],
): ReachabilityReport {
  const routes = extractRoutes(routerSource);
  const targets = componentSources.flatMap(extractLinkTargets);
  return {
    routes,
    unreachable: routes.filter((r) => !allowlist.includes(r) && !isReached(r, targets)),
  };
}
