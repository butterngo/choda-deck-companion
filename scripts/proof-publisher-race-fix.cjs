// Two publishers from the race, each uploading one artifact. GitHub is stubbed:
// the release list is either empty or holds a pre-created draft. Counts how many
// releases electron-builder's own getOrCreateRelease would create.
const path = require('path');
const root = process.argv[2] ?? path.resolve(__dirname, '..');
const pm = path.join(root, 'node_modules/.pnpm/app-builder-lib@26.15.3_dmg_c5739d9600ac3f98a55503c35c5a46a9/node_modules/app-builder-lib/out/publish/PublishManager.js');
const { PublishManager } = require(pm);
const { GitHubPublisher } = require(path.join(root, 'node_modules/.pnpm/electron-publish@26.15.3/node_modules/electron-publish/out/gitHubPublisher.js'));
process.env.GH_TOKEN = 'ghp_fake0123456789';
const cfg = () => ({ provider: 'github', owner: 'butterngo', repo: 'choda-deck-companion', releaseType: 'draft' });

async function scenario(label, existing) {
  let created = 0;
  const list = [...existing];
  GitHubPublisher.prototype.githubRequest = async function (p, token, data) {
    if (p.endsWith('/releases') && data == null) { await new Promise((r) => setTimeout(r, 5)); return JSON.parse(JSON.stringify(list)); }
    throw new Error('unexpected request ' + p);
  };
  GitHubPublisher.prototype.createRelease = async function () { await new Promise((r) => setTimeout(r, 20)); created++; const r = { id: 1000 + created, tag_name: 'v9.9.9', draft: true }; list.push(r); return r; };
  const s = { nameToPublisher: new Map(), publishOptions: { publish: 'always' }, packager: { config: {}, info: {} } };
  const [a, b] = await Promise.all([
    PublishManager.prototype.getOrCreatePublisher.call(s, cfg(), { version: '9.9.9' }),
    PublishManager.prototype.getOrCreatePublisher.call(s, cfg(), { version: '9.9.9' }),
  ]);
  const [ra, rb] = await Promise.all([a._release.value, b._release.value]);
  console.log(`${label}: publishers=${a === b ? 1 : 2} releasesCreated=${created} blockmap->id=${ra.id} exe->id=${rb.id}`);
}
(async () => {
  await scenario('no draft beforehand (today)   ', []);
  await scenario('draft created first (--prepare)', [{ id: 777, tag_name: 'v9.9.9', draft: true }]);
})().catch((e) => { console.error(e); process.exit(1); });
