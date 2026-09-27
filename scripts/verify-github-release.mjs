// TASK-2052 — check a release where auto-update actually reads it: on GitHub.
//
// verify-release-manifest.mjs compares latest.yml with the installer on local disk.
// It passed on every release from 0.13.0 to 0.17.1, and none of them could be seen
// by electron-updater: they were drafts, and three of them were split across two
// releases on one tag. Local files cannot show either problem, so this script asks
// the GitHub API what the tag really holds.
//
// Default mode: the tag must resolve to exactly one published, non-prerelease
// release that carries every expected asset, fully uploaded. Exit 1 otherwise.
// --promote: the same, except a draft is allowed. If the draft passes, flip it to
// published and latest, then check it again as published. electron-builder uploads
// into a draft (build.publish.releaseType), so this is the one step that reaches
// the feed. See docs/knowledge/publish-as-a-draft-then-flip-it-only-after-github-confirms-the-release.md
// --prepare: run before electron-builder. It creates the tag's draft so that both
// of electron-builder's publishers upload into it (see planPrepare below).

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';

export function expectedAssetsFor(version) {
  return [`choda-companion-setup-${version}.exe`, `choda-companion-setup-${version}.exe.blockmap`, 'latest.yml'];
}

// Pure: takes the API's release list so every branch is testable without a network.
export function checkTagReleases({ releases, tag, expectedAssets, allowDraft = false }) {
  const onTag = releases.filter((r) => r.tag_name === tag);
  if (onTag.length === 0) {
    return { ok: false, problems: [`no release on tag ${tag}`] };
  }
  if (onTag.length > 1) {
    const detail = onTag.map((r) => `id=${r.id} draft=${r.draft} [${r.assets.map((a) => a.name).join(', ')}]`);
    return {
      ok: false,
      problems: [`${onTag.length} releases on tag ${tag}, expected exactly one — the split-publisher case: ${detail.join('; ')}`],
    };
  }

  const [release] = onTag;
  const problems = [];
  if (release.draft && !allowDraft) {
    problems.push(`release id=${release.id} on ${tag} is a draft — electron-updater cannot see it`);
  }
  if (release.prerelease) {
    problems.push(`release id=${release.id} on ${tag} is a prerelease — electron-updater skips it`);
  }
  const byName = new Map(release.assets.map((a) => [a.name, a]));
  for (const name of expectedAssets) {
    const asset = byName.get(name);
    if (!asset) problems.push(`asset missing from ${tag}: ${name}`);
    else if (asset.state !== 'uploaded') problems.push(`asset ${name} on ${tag} is in state "${asset.state}", not "uploaded"`);
  }
  return { ok: problems.length === 0, problems, release };
}

// --prepare runs before electron-builder. electron-builder 26 creates one publisher
// per artifact event that misses its cache, and the blockmap and exe events both
// miss: getOrCreatePublisher awaits between reading and writing the cache. Each
// publisher then creates its own release on the tag. When a draft already exists,
// both publishers upload into that draft instead. So the fix is to create the draft
// first. Proof: scripts/proof-publisher-race.cjs (the race) and
// scripts/proof-publisher-race-fix.cjs (the fix), outputs in docs/reports/task-2052/.
export function planPrepare({ releases, tag }) {
  const onTag = releases.filter((r) => r.tag_name === tag);
  if (onTag.length === 0) return { action: 'create' };
  if (onTag.length > 1) {
    return { action: 'refuse', problem: `${onTag.length} releases already on tag ${tag} — delete the extras before publishing into it` };
  }
  const [release] = onTag;
  if (!release.draft) {
    return { action: 'refuse', problem: `tag ${tag} is already published (id=${release.id}) — bump package.json version instead of publishing over it` };
  }
  return { action: 'reuse', release };
}

// GitHub paginates with a Link header; the release list is past one page already.
export function nextPageUrl(linkHeader) {
  return linkHeader?.match(/<([^>]+)>;\s*rel="next"/)?.[1];
}

// Drafts are listed only for a token with push access. Without a token a split
// made of one published and one draft release would look like a single release,
// and the check would pass. So a missing token is a failure, not a fallback.
function resolveToken(env = process.env) {
  const fromEnv = env.GH_TOKEN || env.GITHUB_TOKEN;
  if (fromEnv) return fromEnv;
  try {
    return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim() || undefined;
  } catch {
    return undefined;
  }
}

async function github(url, token, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
      ...init.headers,
    },
  });
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${url} → ${res.status} ${await res.text()}`);
  return res;
}

export async function listReleases({ owner, repo, token }) {
  const releases = [];
  let url = `https://api.github.com/repos/${owner}/${repo}/releases?per_page=100`;
  while (url) {
    const res = await github(url, token);
    releases.push(...(await res.json()));
    url = nextPageUrl(res.headers.get('link'));
  }
  return releases;
}

async function publishRelease({ owner, repo, token, id }) {
  await github(`https://api.github.com/repos/${owner}/${repo}/releases/${id}`, token, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ draft: false, make_latest: 'true' }),
  });
}

async function createDraftRelease({ owner, repo, token, tag }) {
  const res = await github(`https://api.github.com/repos/${owner}/${repo}/releases`, token, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    // name matches what electron-builder would give it: the bare version.
    body: JSON.stringify({ tag_name: tag, name: tag.replace(/^v/, ''), draft: true, prerelease: false }),
  });
  return res.json();
}

function parseArgs(argv) {
  const args = { extraAssets: [], promote: false, prepare: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--tag') args.tag = argv[++i];
    else if (argv[i] === '--asset') args.extraAssets.push(argv[++i]);
    else if (argv[i] === '--promote') args.promote = true;
    else if (argv[i] === '--prepare') args.prepare = true;
    else throw new Error(`unknown argument: ${argv[i]}`);
  }
  return args;
}

function fail(problems) {
  console.error('[verify-github-release] the release is NOT fit for the auto-update feed:\n');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

if (process.argv[1]?.endsWith('verify-github-release.mjs')) {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const { owner, repo } = pkg.build.publish;
  const args = parseArgs(process.argv.slice(2));
  const tag = args.tag ?? `v${pkg.version}`;
  const expectedAssets = [...expectedAssetsFor(tag.replace(/^v/, '')), ...args.extraAssets];

  const token = resolveToken();
  if (!token) {
    fail(['no GitHub token (GH_TOKEN, GITHUB_TOKEN or `gh auth token`) — drafts are invisible without one, so the release count cannot be trusted']);
  }

  if (args.prepare) {
    const plan = planPrepare({ releases: await listReleases({ owner, repo, token }), tag });
    if (plan.action === 'refuse') fail([plan.problem]);
    const release = plan.action === 'create' ? await createDraftRelease({ owner, repo, token, tag }) : plan.release;
    console.log(`[verify-github-release] ${tag}: ${plan.action === 'create' ? 'created' : 'reusing'} draft release id=${release.id} for electron-builder to upload into.`);
    process.exit(0);
  }

  let result = checkTagReleases({ releases: await listReleases({ owner, repo, token }), tag, expectedAssets, allowDraft: args.promote });
  if (!result.ok) fail(result.problems);

  if (args.promote && result.release.draft) {
    console.log(`[verify-github-release] ${tag}: one draft with every asset — publishing release id=${result.release.id}.`);
    await publishRelease({ owner, repo, token, id: result.release.id });
    // Check the result, not the request: re-read the tag as published.
    result = checkTagReleases({ releases: await listReleases({ owner, repo, token }), tag, expectedAssets });
    if (!result.ok) fail(result.problems);
  }
  console.log(`[verify-github-release] ${tag}: exactly one published release (id=${result.release.id}) carrying ${expectedAssets.join(', ')}.`);
}
