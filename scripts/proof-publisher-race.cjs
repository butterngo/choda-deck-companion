// Drives electron-builder 26.15.3's own getOrCreatePublisher, twice, the way the
// NSIS target does: the blockmap event and the exe event arrive before either
// publisher is cached. No network: a publisher's release is only fetched on upload.
const path = require('path');
const root = process.argv[2] ?? path.resolve(__dirname, '..');
const { PublishManager } = require(path.join(root, 'node_modules/.pnpm/app-builder-lib@26.15.3_dmg_c5739d9600ac3f98a55503c35c5a46a9/node_modules/app-builder-lib/out/publish/PublishManager.js'));
process.env.GH_TOKEN = 'ghp_fake0123456789';
const cfg = () => ({ provider: 'github', owner: 'butterngo', repo: 'choda-deck-companion', releaseType: 'draft' });
const self = (() => ({
  nameToPublisher: new Map(),
  publishOptions: { publish: 'always' },
  packager: { config: {}, info: {} },
}));
const appInfo = { version: '9.9.9' };
(async () => {
  const s = self();
  const [a, b] = await Promise.all([
    PublishManager.prototype.getOrCreatePublisher.call(s, cfg(), appInfo), // blockmap event
    PublishManager.prototype.getOrCreatePublisher.call(s, cfg(), appInfo), // exe event
  ]);
  console.log('concurrent: same publisher instance?', a === b, '| cache size', s.nameToPublisher.size);
  const later = await PublishManager.prototype.getOrCreatePublisher.call(s, cfg(), appInfo); // latest.yml, after awaitTasks
  console.log('latest.yml joins the exe publisher (last set)?', later === b, '| joins blockmap publisher?', later === a);
  const t = self();
  const c = await PublishManager.prototype.getOrCreatePublisher.call(t, cfg(), appInfo);
  const d = await PublishManager.prototype.getOrCreatePublisher.call(t, cfg(), appInfo);
  console.log('sequential control: same publisher instance?', c === d);
})().catch((e) => { console.error(e); process.exit(1); });
