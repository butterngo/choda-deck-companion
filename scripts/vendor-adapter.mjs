// TASK-1438 — the companion adapter (dist/companion-server.cjs, built via
// `pnpm run build:companion` in the SIBLING choda-deck checkout) has zero
// presence in this repo's own files. electron-builder can only package what's
// in this repo, so this script copies the built adapter + its one hard native
// dependency (better-sqlite3 — required for any DB access at all) into
// electron/vendor/ before packaging, which build.extraResources then ships
// under resources/adapter/ in the installed app.
//
// Verified by actually booting the packaged adapter: better-sqlite3 and
// sqlite-vec are both required unconditionally at module load (the adapter
// won't even start without sqlite-vec, despite it sounding embedding-only),
// so both are vendored.
//
// TASK-1743 closed the gap this comment used to describe: the embedding stack
// (@huggingface/transformers + onnxruntime-node + sharp) is now vendored too,
// along with the model itself, so packaged-app knowledge search returns real
// hits instead of {enabled:false, reason}. See EMBEDDING_DEPS below for what
// is copied and what is deliberately left behind.

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

// TASK-1743 — the embedding stack, copied with a per-package filter because
// copying these wholesale is ~440 MB and almost none of it is reachable.
//
// The set below is not from reading package.json `dependencies` — it is what a
// scratch harness actually needed before `pipeline('feature-extraction', ...)`
// would load, discovered by copying packages in one at a time until the import
// stopped throwing. Two results were not guessable:
//
//   * `sharp` (and @img/sharp-win32-x64, @img/colour, detect-libc) is required
//     EAGERLY at the top of transformers' node bundle, not lazily at the first
//     image call — so a text-only embedding path still drags in all 20 MB of it.
//   * `onnxruntime-web` is listed as a transformers dependency but the node
//     bundle never requires it. Not vendored.
//
// `true` means copy the package whole; a function is a path filter receiving
// the path RELATIVE to the package root ('' for the root itself).
const ORT_GPU_DLLS = ['DirectML.dll', 'dxcompiler.dll', 'dxil.dll']

const keepPrefixes = (...prefixes) => (rel) =>
  rel === '' || prefixes.some((p) => rel === p || rel.startsWith(p + path.sep) || p.startsWith(rel + path.sep))

const EMBEDDING_DEPS = {
  // dist/ holds every build variant (web, min, mjs, cjs — ~7 MB total); src/
  // and types/ are another 5 MB of things a runtime never reads.
  '@huggingface/transformers': keepPrefixes('package.json', 'dist', 'LICENSE'),
  // bin/ ships every platform (211 MB). Keep win32/x64 only — arm64 is another
  // 65 MB and `build.win.target` is x64 nsis. Then drop the three DirectML GPU
  // DLLs inside it (38 MB): the CPU execution provider is what a 384-dim MiniLM
  // feature-extraction runs on, and a scratch harness embedded correctly with
  // them deleted. script/ is the postinstall downloader, which must never run
  // inside a packaged app. Net: 24 MB instead of 211 MB.
  'onnxruntime-node': (rel) =>
    keepPrefixes('package.json', 'dist', 'lib', path.join('bin', 'napi-v6', 'win32', 'x64'))(rel) &&
    !ORT_GPU_DLLS.includes(path.basename(rel)),
  'onnxruntime-common': true,
  sharp: true,
  '@img/sharp-win32-x64': true,
  '@img/colour': true,
  'detect-libc': true
}

// The model MODEL_ID in choda-deck's LocalEmbeddingProvider resolves to.
// transformers.js caches hub downloads under its own package directory in this
// exact `<modelId>/<file>` layout, which is also the layout
// `env.localModelPath` reads — so the warmed dev cache IS the vendorable
// artifact, no separate download step needed.
const MODEL_ID = 'Xenova/all-MiniLM-L6-v2'
const MODEL_CACHE = path.join(
  chodaDeckRoot,
  'node_modules',
  '@huggingface',
  'transformers',
  '.cache',
  MODEL_ID
)

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
// drops any nested `node_modules` directory from a SOURCE path (verified: it
// copies everything else, but that literal path segment vanishes).
//
// TASK-1743 — the installed app nonetheless needs the name back, because the
// adapter reaches the embedding library through a dynamic `import()` and ESM
// resolution honours no other directory name. package.json handles that by
// mapping this `deps` source onto an `adapter/node_modules` DESTINATION, which
// the matcher accepts. Renaming it in an afterPack hook was tried first and
// rejected: renameSync on the freshly-written 122 MB tree throws EPERM on
// Windows.
const stagingNodeModules = path.join(vendorDir, 'node_modules')
const finalDepsDir = path.join(vendorDir, 'deps')
const modelsDir = path.join(vendorDir, 'models')

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

for (const [dep, filter] of Object.entries(EMBEDDING_DEPS)) {
  const src = path.join(chodaDeckRoot, 'node_modules', dep)
  if (!existsSync(src)) {
    fail(`${dep} not found at ${src} — run "pnpm install --include=optional" in ${chodaDeckRoot} first.`)
  }
  cpSync(src, path.join(stagingNodeModules, dep), {
    recursive: true,
    dereference: true,
    ...(typeof filter === 'function'
      ? { filter: (srcPath) => filter(path.relative(src, srcPath)) }
      : {})
  })
}

// The model files. Absent unless someone has run an embedding in the sibling
// checkout at least once — so say exactly how to warm it rather than shipping
// an app whose search silently 404s on its own model.
if (!existsSync(path.join(MODEL_CACHE, 'onnx', 'model.onnx'))) {
  fail(
    `${MODEL_ID} not cached at ${MODEL_CACHE} — warm it once in ${chodaDeckRoot} ` +
      `with: node -e "import('@huggingface/transformers').then(m=>m.pipeline('feature-extraction','${MODEL_ID}'))"`
  )
}
cpSync(MODEL_CACHE, path.join(modelsDir, MODEL_ID), { recursive: true, dereference: true })

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

console.log(
  `[vendor-adapter] copied adapter + ${VENDORED_DEPS.join(', ')} + embedding stack ` +
    `(${Object.keys(EMBEDDING_DEPS).join(', ')}) + ${MODEL_ID} into ${vendorDir} ` +
    `(${NATIVE_MODULES_TO_REBUILD.join(', ')} rebuilt for Electron's ABI)`
)
