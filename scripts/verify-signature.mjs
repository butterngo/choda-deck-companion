// Asserts what the packaged installer ACTUALLY is, rather than what the build
// log claimed. This exists because of a specific mistake worth not repeating:
//
// electron-builder prints `• signing with signtool.exe path=…setup-0.5.1.exe`
// on every Windows build. It printed it for 0.4.0, 0.5.0 and 0.5.1 — none of
// which are signed. There is no certificate configured, none in either
// certificate store, and no CSC_* environment variables; the step announces
// itself and produces nothing. A release note went out calling an unsigned
// installer "signed" on the strength of that line alone.
//
// So the rule this script encodes: THE LOG LINE IS NOT EVIDENCE. Ask the
// artifact. `Get-AuthenticodeSignature` reads the file's own certificate
// table, which is the thing Windows itself will read when a user runs it.
//
// Exits 0 when unsigned, on purpose. Signing needs a CA-issued code-signing
// certificate — a purchase and an identity check, not a config change — and
// failing every local build over a certificate nobody has yet would just teach
// people to pass --no-verify. Set CHODA_REQUIRE_SIGNED=1 to make it blocking,
// which is what a release pipeline should do once a certificate exists.

import { execFileSync } from 'node:child_process'
import { readdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const releaseDir = path.join(repoRoot, 'release')
const required = process.env.CHODA_REQUIRE_SIGNED === '1'

if (process.platform !== 'win32') {
  console.log('[verify-signature] not Windows — nothing to check')
  process.exit(0)
}
if (!existsSync(releaseDir)) {
  console.error('[verify-signature] no release/ directory — run `pnpm run dist` first')
  process.exit(1)
}

const { version } = JSON.parse(
  execFileSync('node', ['-p', 'JSON.stringify(require("./package.json"))'], {
    cwd: repoRoot,
    encoding: 'utf8',
  }),
)

// Only this version's artifacts. Older unsigned installers linger in release/
// and are not this build's problem.
const targets = readdirSync(releaseDir).filter(
  (f) => f.endsWith('.exe') && f.includes(version) && !f.includes('__uninstaller'),
)

if (targets.length === 0) {
  console.error(`[verify-signature] no .exe for version ${version} in release/`)
  process.exit(1)
}

/** @returns {{file: string, status: string, subject: string}} */
function inspect(file) {
  // -Raw would still need parsing; a delimited line is unambiguous and avoids
  // depending on PowerShell's table formatting, which wraps long subjects.
  const script =
    `$s = Get-AuthenticodeSignature -LiteralPath '${path.join(releaseDir, file).replace(/'/g, "''")}'; ` +
    `Write-Output ("{0}|{1}" -f $s.Status, $(if ($s.SignerCertificate) { $s.SignerCertificate.Subject } else { '-' }))`
  const out = execFileSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    { encoding: 'utf8' },
  ).trim()
  const [status = 'Unknown', subject = '-'] = out.split('|')
  return { file, status, subject }
}

const results = targets.map(inspect)
const unsigned = results.filter((r) => r.status !== 'Valid')

for (const r of results) {
  const mark = r.status === 'Valid' ? 'signed  ' : 'UNSIGNED'
  console.log(`[verify-signature] ${mark} ${r.file} — ${r.status}${r.subject !== '-' ? ` (${r.subject})` : ''}`)
}

if (unsigned.length === 0) {
  console.log('[verify-signature] all artifacts carry a valid signature')
  process.exit(0)
}

console.log('')
console.log('[verify-signature] Windows SmartScreen will warn "Unknown publisher" and')
console.log('[verify-signature] require "More info → Run anyway" for these artifacts.')
console.log('[verify-signature] To sign: obtain a CA-issued code-signing certificate, then set')
console.log('[verify-signature]   CSC_LINK=<path-or-base64-of-.pfx>  CSC_KEY_PASSWORD=<password>')
console.log('[verify-signature] electron-builder reads both without any package.json change.')

process.exit(required ? 1 : 0)
