// TASK-1438 — the companion adapter (dist/companion-server.cjs, built via
// `pnpm run build:companion` in the SIBLING choda-deck checkout) has zero
// presence in this repo's own files. electron-builder can only package what's
// in this repo, so this script copies the built adapter + its one hard native
// dependency (better-sqlite3 — required for any DB access at all) into
// electron/vendor/ before packaging, which build.extraResources then ships
// under resources/adapter/ in the installed app.
//
// Known gap (documented, not silently glossed over): the adapter's remaining
// --external deps (@huggingface/transformers, onnxruntime-node/web, sharp)
// are only reached by the embedding-provider call path, which already
// degrades gracefully (GET /knowledge/search returns {enabled:false, reason})
// when unavailable — they are NOT vendored here, so packaged-app search runs
// in the degraded/disabled state until a follow-up vendors them too. Verified
// by actually booting the packaged adapter: better-sqlite3 and sqlite-vec are
// both required unconditionally at module load (the adapter won't even start
// without sqlite-vec, despite it sounding embedding-only), so both are
// vendored; the others are not required until an embedding call is made.

import { existsSync, mkdirSync, rmSync, cpSync, writeFileSync, renameSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')
const chodaDeckRoot = path.resolve(repoRoot, '..', 'choda-deck')

const adapterEntry = path.join(chodaDeckRoot, 'dist', 'companion-server.cjs')
// better-sqlite3 (+ its own runtime dep chain bindings -> file-uri-to-path):
// required for any DB access at all. sqlite-vec (+ its Windows native
// package): required at module load time even when embeddings are disabled
// (verified — the adapter fails to `require()` at all without it, not just at
// the embedding-search call site), so it isn't actually optional despite
// being embedding-flavored. choda-deck's node-linker=hoisted means these are
// flat top-level node_modules entries, not a nested per-package tree, so each
// one needed at runtime must be listed explicitly here.
const VENDORED_DEPS = ['better-sqlite3', 'bindings', 'file-uri-to-path', 'sqlite-vec', 'sqlite-vec-windows-x64']

// better-sqlite3's prebuilt .node binary is compiled against the SYSTEM
// Node.js ABI (choda-deck's own `pnpm install`), not Electron's — Electron
// bundles its own Node build with a different NODE_MODULE_VERSION. Loading
// the un-rebuilt binary under Electron (even via ELECTRON_RUN_AS_NODE=1)
// throws ERR_DLOPEN_FAILED ("was compiled against a different Node.js
// version"). Found via an actual install crashing with exactly that error,
// not by inspection — the fix is to rebuild it here, against this repo's own
// installed `electron` version, same as english-companion's own `rebuild`
// script (`electron-rebuild -f -w better-sqlite3`).
const NATIVE_MODULES_TO_REBUILD = ['better-sqlite3']

const vendorDir = path.join(repoRoot, 'electron', 'vendor')
const vendorEntry = path.join(vendorDir, 'companion-server.cjs')
// electron-rebuild's --module-dir expects a real project root: a directory
// with its own package.json whose node_modules it walks. So deps are staged
// under a literal `node_modules` folder for the rebuild step, then renamed to
// `deps` afterward — electron-builder's extraResources file-matcher silently
// drops any nested `node_modules` directory from the packaged output
// (verified: it copies everything else, but that literal path segment
// vanishes), so the final packaged layout can't keep that name.
const stagingNodeModules = path.join(vendorDir, 'node_modules')
const finalDepsDir = path.join(vendorDir, 'deps')

function fail(message) {
  console.error(`[vendor-adapter] ${message}`)
  process.exit(1)
}

if (!existsSync(adapterEntry)) {
  fail(
    `adapter build not found at ${adapterEntry} — run "pnpm run build:companion" in ${chodaDeckRoot} first.`
  )
}

rmSync(vendorDir, { recursive: true, force: true })
mkdirSync(vendorDir, { recursive: true })
mkdirSync(stagingNodeModules, { recursive: true })

cpSync(adapterEntry, vendorEntry)
// pnpm's node_modules is a tree of symlinks into its content-addressed store
// (including each package's OWN nested deps, e.g. better-sqlite3's `bindings`)
// — a plain recursive copy preserves those symlinks pointing at paths outside
// vendorDir, which dangle once electron-builder repackages the tree.
// dereference:true resolves every symlink to a real file/dir as it copies.
for (const dep of VENDORED_DEPS) {
  const src = path.join(chodaDeckRoot, 'node_modules', dep)
  if (!existsSync(src)) fail(`${dep} not found at ${src} — run "pnpm install" in ${chodaDeckRoot} first.`)
  cpSync(src, path.join(stagingNodeModules, dep), { recursive: true, dereference: true })
}

// A minimal package.json so electron-rebuild treats vendorDir as a project
// root — it needs the vendored packages actually LISTED as dependencies here
// to discover them at all ("No native modules found" otherwise, even with
// the files physically present in node_modules).
writeFileSync(
  path.join(vendorDir, 'package.json'),
  JSON.stringify({
    name: 'choda-companion-adapter-vendor',
    version: '0.0.0',
    private: true,
    dependencies: Object.fromEntries(VENDORED_DEPS.map((dep) => [dep, '*']))
  })
)

// Invoke via `node <cli.js>` rather than the .bin/.cmd shim — Windows'
// execFileSync on a .cmd wrapper is finicky (EINVAL) without a shell, and
// shelling out just to run a wrapper script is unnecessary indirection.
const electronRebuildCli = path.join(repoRoot, 'node_modules', '@electron', 'rebuild', 'lib', 'cli.js')
if (!existsSync(electronRebuildCli)) fail(`@electron/rebuild not found at ${electronRebuildCli} — run "pnpm install" first.`)
try {
  execFileSync(
    process.execPath,
    [electronRebuildCli, '--force', '--only', NATIVE_MODULES_TO_REBUILD.join(','), '--module-dir', vendorDir],
    { stdio: 'inherit' }
  )
} catch (err) {
  fail(`electron-rebuild failed for ${NATIVE_MODULES_TO_REBUILD.join(', ')}: ${err.message}`)
}

rmSync(finalDepsDir, { recursive: true, force: true })
renameSync(stagingNodeModules, finalDepsDir)

console.log(`[vendor-adapter] copied adapter + ${VENDORED_DEPS.join(', ')} into ${vendorDir} (${NATIVE_MODULES_TO_REBUILD.join(', ')} rebuilt for Electron's ABI)`)
