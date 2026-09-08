#!/usr/bin/env node
/**
 * FIND A SECRET SITTING IN A WORKING DIRECTORY, BEFORE SOMEBODY COPIES IT.
 *
 * Two credential leaks landed on this machine on the same day, from two
 * different agents working on this repository:
 *
 *   - ZEP_AUTH_SECRET, when masking with `sed` on macOS silently did not
 *     substitute and the value went into a session log;
 *   - two full `railway variables` dumps -- 70 and 126 variables WITH VALUES,
 *     including every bot token, the AWS pair, DATABASE_URL, the Infisical
 *     client secret and a GitHub token -- written to a scratchpad file and
 *     left there.
 *
 * Neither was noticed by the process that created it. Both were found only
 * because somebody went looking, which is not a control.
 *
 * WHAT THIS IS NOT. It cannot prove a directory is clean: it knows the SHAPES
 * of common credentials, and a secret with no recognisable shape (a short
 * password, a numeric PIN) passes straight through. It is a smoke detector,
 * not a guarantee, and saying so is the point -- a scanner reported as "clean"
 * that nobody understands the limits of is worse than none.
 *
 * IT NEVER PRINTS WHAT IT FINDS. The file, the byte offset, the length and the
 * kind -- never the value. A leak report that quotes the leak has copied it
 * once more, into whatever reads the report.
 *
 *   node scripts/scan-secrets-on-disk.cjs <dir> [<dir>...]
 *
 * Exit 1 when anything matched, so it can gate a step.
 */
const fs = require('fs')
const path = require('path')

const SHAPES = [
  ['telegram bot token', /\b\d{8,10}:[A-Za-z0-9_-]{30,}/g],
  ['jwt', /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g],
  ['openai-style key', /\bsk-[A-Za-z0-9_-]{16,}/g],
  ['aws access key id', /\bAKIA[0-9A-Z]{12,}/g],
  ['url with a password', /\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:[^\s@/]+@/g],
  ['github token', /\bgh[pousr]_[A-Za-z0-9]{20,}/g],
  ['private key block', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
]

/**
 * A dump of environment variables, recognised by shape rather than by name.
 *
 * THE SEPARATOR IS THE WHOLE DISCRIMINATOR, and the first version got it wrong.
 * Allowing a bare `NAME: value` made every TypeScript enum, interface and
 * config object look like a dump: measured on this repository, 44 matches of
 * which almost all were source files doing nothing wrong. A scanner that cries
 * wolf gets switched off, and then it is not a scanner.
 *
 * The two shapes a real dump actually takes are `NAME=value` (shell, dotenv,
 * `railway variables --kv`) and `"NAME": "value"` (JSON, which is what
 * `railway variables --json` writes -- the form that leaked). A quoted key or
 * an equals sign is the difference between a dump and a program.
 */
const ENV_DUMP =
  /(?:^|\n)\s*(?:[A-Z][A-Z0-9_]{4,}=[^\n]{8,}|"[A-Z][A-Z0-9_]{4,}"\s*:\s*"[^\n"]{8,}")/g
const ENV_DUMP_MIN = 15

/**
 * Files whose JOB is to contain these shapes.
 *
 * Narrow and named on purpose: three secret scanners and this file's own test.
 * An ignore list is a hole, so it stays a list of specific paths rather than a
 * pattern that could grow to cover something real.
 */
const SELF_REFERENTIAL = [
  'scripts/probe-secrets-in-db.cjs',
  'scripts/probe-secrets-in-history.cjs',
  'scripts/security-token-guard.sh',
  'src/__tests__/security/no-secrets-in-repo.test.ts',
  'src/__tests__/tools/aSecretOnDiskMustBeFound.test.ts',
  'scripts/scan-secrets-on-disk.cjs',
]
const isSelfReferential = f =>
  SELF_REFERENTIAL.some(p => f === p || f.endsWith('/' + p) || f.endsWith(p))

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next'])
const MAX_BYTES = 8 * 1024 * 1024

function* walk(dir) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) yield* walk(p)
    } else if (e.isFile()) {
      yield p
    }
  }
}

function scanFile(file) {
  if (isSelfReferential(file)) return []
  let text
  try {
    if (fs.statSync(file).size > MAX_BYTES) return []
    text = fs.readFileSync(file, 'utf8')
  } catch {
    return []
  }
  const hits = []
  for (const [kind, rx] of SHAPES) {
    rx.lastIndex = 0
    const m = rx.exec(text)
    if (m) hits.push({ kind, at: m.index, len: m[0].length })
  }
  const envHits = (text.match(ENV_DUMP) || []).length
  if (envHits >= ENV_DUMP_MIN)
    hits.push({ kind: `env dump (${envHits} assignments)`, at: 0, len: 0 })
  return hits
}

function main() {
  const roots = process.argv.slice(2)
  if (!roots.length) {
    console.error(
      'usage: node scripts/scan-secrets-on-disk.cjs <dir> [<dir>...]'
    )
    process.exit(2)
  }
  let files = 0
  const found = []
  /*
   * A ROOT THAT DOES NOT EXIST MUST NOT READ AS CLEAN.
   *
   * walk() swallows a bad path and yields nothing, so scanning a typo produced
   * "no known credential SHAPE matched" -- the empty search wearing the shape
   * of a good result, which is the defect this whole tool exists to fight.
   */
  const missing = roots.filter(r => !fs.existsSync(r))
  if (missing.length) {
    console.error(`these roots do not exist: ${missing.join(', ')}`)
    process.exit(2)
  }
  for (const root of roots)
    for (const f of walk(root)) {
      files++
      for (const h of scanFile(f)) found.push({ file: f, ...h })
    }
  console.log(`scanned ${files} file(s) under ${roots.length} root(s)`)
  if (!files) {
    console.error('scanned NOTHING -- refusing to call that clean')
    process.exit(2)
  }
  if (!found.length) {
    console.log('no known credential SHAPE matched.')
    console.log(
      'this is not proof of cleanliness: a secret without a recognisable shape passes.'
    )
    return
  }
  console.log(`\n${found.length} match(es) -- values are NOT printed:`)
  for (const h of found)
    console.log(
      `  ${h.kind}: ${h.file}` +
        (h.len ? ` (offset ${h.at}, ${h.len} chars)` : '')
    )
  console.log(
    '\nDelete the file, then decide about rotation. A value that reached a disk'
  )
  console.log('you do not control has to be treated as disclosed.')
  process.exit(1)
}

module.exports = { scanFile, SHAPES, ENV_DUMP_MIN }
if (require.main === module) main()
