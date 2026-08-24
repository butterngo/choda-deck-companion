// TASK-1763 — refuse to start a build whose publish step is already doomed.
//
// `dist:publish` used to build the full ~196 MB installer, reach electron-builder's
// publish step, and abort there on a missing GH_TOKEN — AFTER the artifacts were
// written but BEFORE `latest.yml` was regenerated. The previous version's manifest
// survived on disk, well-formed and naming the wrong version. Uploading it points
// every auto-updating client at an asset that does not exist in the new release:
// no error, no warning, just clients that can never update again.
//
// The obvious-looking alternative — regenerate latest.yml before publishing — is not
// implementable. The manifest carries the installer's sha512 and size, neither of
// which exists until the installer does. So the only real fix is to not begin.

const HINT = 'export GH_TOKEN=$(gh auth token)';

export function checkPublishEnv(env = process.env) {
  const token = env.GH_TOKEN ?? env.GITHUB_TOKEN;
  if (typeof token === 'string' && token.length > 0) return { ok: true };
  return {
    ok: false,
    reason:
      'GH_TOKEN (or GITHUB_TOKEN) is not set, so electron-builder would build the ' +
      'installer and then fail at the publish step — leaving the PREVIOUS version\'s ' +
      `release/latest.yml on disk. Set a token first:\n\n  ${HINT}\n`,
  };
}

// Only act when run as a script, so the check stays importable by tests.
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('preflight-publish.mjs')) {
  const result = checkPublishEnv();
  if (!result.ok) {
    console.error(`[preflight-publish] ${result.reason}`);
    process.exit(1);
  }
  console.log('[preflight-publish] GH_TOKEN present — safe to build and publish.');
}
