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

import { existsSync, mkdirSync, rmSync, cpSync } from 'node:fs'
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

// "deps", not "node_modules" — electron-builder's extraResources file-matcher
// silently drops any nested `node_modules` dir (verified: it copies everything
// else but that literal path segment vanishes from the packaged output), so
// the vendored native module lives one level away from that name and
// adapter-launcher.cjs's resolveNodePath points NODE_PATH at it directly.
const vendorDir = path.join(repoRoot, 'electron', 'vendor')
const vendorEntry = path.join(vendorDir, 'companion-server.cjs')
const vendorNodeModules = path.join(vendorDir, 'deps')

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
mkdirSync(vendorNodeModules, { recursive: true })

cpSync(adapterEntry, vendorEntry)
// pnpm's node_modules is a tree of symlinks into its content-addressed store
// (including each package's OWN nested deps, e.g. better-sqlite3's `bindings`)
// — a plain recursive copy preserves those symlinks pointing at paths outside
// vendorDir, which dangle once electron-builder repackages the tree.
// dereference:true resolves every symlink to a real file/dir as it copies.
for (const dep of VENDORED_DEPS) {
  const src = path.join(chodaDeckRoot, 'node_modules', dep)
  if (!existsSync(src)) fail(`${dep} not found at ${src} — run "pnpm install" in ${chodaDeckRoot} first.`)
  cpSync(src, path.join(vendorNodeModules, dep), { recursive: true, dereference: true })
}

console.log(`[vendor-adapter] copied adapter + ${VENDORED_DEPS.join(', ')} into ${vendorDir}`)
