#!/usr/bin/env node
//
// sweep — first step of a class-sweep: list every call-site of a symbol and
// flag the ones that DISCARD its result (bare `await X(` with no assignment).
//
// WHY. The loop's most productive recent pattern is the class-sweep: when a
// point-fix lands (e.g. instagramParserWizard honesty #1393, updateUserBalance
// cache-throw #1398), the same bug shape almost always has a sibling. This finds
// the siblings fast: for a risky primitive (updateUserBalance, processBalance*,
// a hard-delete, a charge), it lists every await call-site grouped by layer and
// marks the discarded-result ones (the unbilled-paid / unchecked-result smell).
//
// Usage: node .claude/loop-opus/sweep.mjs <symbol>
// It reports, never mutates. A flagged site is a HYPOTHESIS -- read it (the
// result may be checked on the next line, or the call may be fire-and-forget).
import fs from 'node:fs'
import path from 'node:path'

const sym = process.argv[2]
if (!sym || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(sym)) {
  console.error(
    'usage: tri sweep <symbol>   (e.g. tri sweep updateUserBalance)'
  )
  process.exit(2)
}

const walk = d =>
  fs.readdirSync(d, { withFileTypes: true }).flatMap(e => {
    const p = path.join(d, e.name)
    if (e.isDirectory())
      return e.name === 'node_modules' || e.name === '.git' ? [] : walk(p)
    return e.isFile() && p.endsWith('.ts') && !p.endsWith('.test.ts') ? [p] : []
  })

const AWAIT = new RegExp(`await\\s+${sym}\\s*\\(`)
const CAPTURED = new RegExp(`(=\\s*await|return\\s+await)\\s+${sym}\\s*\\(`)

const bucket = f =>
  f.includes('/scenes/')
    ? 'scenes'
    : f.includes('/services/')
      ? 'services'
      : f.includes('/inngest')
        ? 'inngest'
        : f.includes('/handlers/')
          ? 'handlers'
          : f.includes('/core/')
            ? 'core'
            : 'other'

const hits = []
for (const f of walk('src')) {
  const lines = fs.readFileSync(f, 'utf8').split('\n')
  lines.forEach((ln, i) => {
    if (AWAIT.test(ln)) {
      hits.push({
        file: f.split(path.sep).join('/'),
        line: i + 1,
        bucket: bucket(f.split(path.sep).join('/')),
        captured: CAPTURED.test(ln),
      })
    }
  })
}

const C = { g: '\x1b[32m', r: '\x1b[31m', d: '\x1b[2m', z: '\x1b[0m' }
if (!hits.length) {
  console.log(`\n  no \`await ${sym}(\` call-sites in src.\n`)
  process.exit(0)
}
// Money ledgers already classify some discarded charges as DEAD/unreachable
// (verified debt, not live bugs). Cross-reference them so a sweep does not
// re-flag a tracked-dead discard as actionable -- reading these BEFORE "fixing"
// a discarded charge avoids editing dead code and breaking the ledger's own
// stale-entry test. The paths listed inside are the source of truth.
const loadDeadLedger = () => {
  const files = [
    'src/__tests__/scenes/charge-result-checked-ratchet.test.ts',
    'src/__tests__/money/unchecked-money-result.test.ts',
  ]
  const dead = new Set()
  for (const lf of files) {
    let txt = ''
    try {
      txt = fs.readFileSync(lf, 'utf8')
    } catch {
      continue
    }
    for (const m of txt.matchAll(/['"`](src\/[^'"`]+\.ts)['"`]/g))
      dead.add(m[1])
  }
  return dead
}
const deadLedger = loadDeadLedger()

const discarded = hits.filter(h => !h.captured)
const trackedDead = discarded.filter(h => deadLedger.has(h.file))
const actionableDiscards = discarded.filter(h => !deadLedger.has(h.file))
console.log(
  `\n  await ${sym}( — ${hits.length} call-sites (${discarded.length} discard the result)\n`
)
for (const b of [
  'scenes',
  'services',
  'inngest',
  'handlers',
  'core',
  'other',
]) {
  const g = hits.filter(h => h.bucket === b)
  if (!g.length) continue
  console.log(`  ${b}:`)
  for (const h of g) {
    const mark = h.captured
      ? `${C.g}captured${C.z}`
      : deadLedger.has(h.file)
        ? `${C.z}DISCARDED (tracked dead — see ledger)${C.z}`
        : `${C.r}DISCARDED${C.z}`
    console.log(`    ${mark}  ${h.file}:${h.line}`)
  }
}
if (discarded.length) {
  console.log(
    `\n  ${C.r}${actionableDiscards.length} actionable discard(s)${C.z}` +
      ` (+${trackedDead.length} tracked-dead in the money ledgers) — a HYPOTHESIS, ` +
      `not a verdict: read each (result may be checked next line / fire-and-forget).\n`
  )
} else {
  console.log(`\n  every call-site captures its result.\n`)
}
