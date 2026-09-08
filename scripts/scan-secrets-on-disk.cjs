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

/** A dump of environment variables, recognised by shape rather than by name. */
const ENV_DUMP = /(?:^|\n)\s*"?[A-Z][A-Z0-9_]{4,}"?\s*[:=]\s*"?[^\n"]{8,}/g
const ENV_DUMP_MIN = 15

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
  for (const root of roots)
    for (const f of walk(root)) {
      files++
      for (const h of scanFile(f)) found.push({ file: f, ...h })
    }
  console.log(`scanned ${files} file(s) under ${roots.length} root(s)`)
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
