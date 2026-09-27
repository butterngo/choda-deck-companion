# TASK-2052 AC-5: why one publish creates two GitHub releases

## Cause

electron-builder 26.15.3 has a check-then-act race in
`PublishManager.getOrCreatePublisher` (app-builder-lib `out/publish/PublishManager.js:166-175`):

```js
let publisher = this.nameToPublisher.get(providerCacheKey);   // read
if (publisher == null) {
  publisher = await createPublisher(...);                       // await: resolveReleaseBody()
  this.nameToPublisher.set(providerCacheKey, publisher);        // write
}
```

The NSIS target emits two artifact events almost together. First it emits the
blockmap (`differentialUpdateInfoBuilder.js` `createBlockmap`, `arch: null`), then
the installer (`NsisTarget.js:313`). Neither handler is awaited before the other
starts (`taskManager.addTask`). Both miss the cache, both pass the `await`, and
electron-builder builds **two `GitHubPublisher` instances with an identical config**.

Each instance has its own `Lazy _release`. Each one lists the releases, finds none
for the tag, and calls `createRelease()`
(electron-publish `out/gitHubPublisher.js`, the `release doesn't exist` branch).
The result is two releases on one tag.

`latest.yml` is emitted later, after `awaitTasks()`. By then the cache holds
whichever publisher was written last, and that is the installer's. This gives the
exact split observed on v0.13.0, v0.15.0, v0.17.0, v0.18.0 and v0.18.1:
{`.exe`, `latest.yml`} on one release and {`.exe.blockmap`} on the other.

This is not two script runs and not a retry. It happens every time a publish
starts with no release on the tag.

## Evidence

`scripts/proof-publisher-race.cjs` drives electron-builder's own
`getOrCreatePublisher` with no network. Output (`publisher-race.out.txt`):

| Case | Result |
|---|---|
| two concurrent calls (blockmap + exe) | two instances; `publishing publisher=Github …` logged twice, as in the real build log |
| a later call (latest.yml) | gets the exe's publisher, not the blockmap's |
| control: two sequential calls | one instance |

## Fix

`GitHubPublisher.getOrCreateRelease` returns an **existing draft** for the tag
instead of creating one. `dist:publish` now runs `release:prepare`
(`verify-github-release.mjs --prepare`) before electron-builder, and that step
creates the draft. Both publishers then upload into it.

`scripts/proof-publisher-race-fix.cjs` stubs only the GitHub HTTP layer. It returns
list snapshots and makes the POST take time, as the network does
(`publisher-race-fix.out.txt`):

| Case | Releases created | Blockmap → | Exe → |
|---|---|---|---|
| no draft beforehand (current behaviour) | 2 | 1001 | 1002 |
| draft created first (`--prepare`) | 0 | 777 | 777 |

The race itself is still there: two publishers are still built. Only its effect is
removed. `release:promote` stays as a backstop, and it refuses to publish a tag that
holds more than one release.

## Not established

The task names v0.6.1, v0.6.2 and v0.0.1 as single-release counter-examples. v0.6.1
was uploaded with `gh release upload` after electron-builder's publisher failed on a
missing `GH_TOKEN` (see `dist-publish-can-leave-a-stale-latest-yml-that-silently-kills-auto-update`),
so it never reached the race. I did not establish the upload path for v0.6.2 and
v0.0.1. A single release on those tags is consistent with the race, which is a
timing window and not a certainty. It does not contradict the cause.
