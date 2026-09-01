#!/usr/bin/env node
// tri fn-liveness -- catch a behavioral ratchet whose fn-under-test has gone DEAD.
//
// WHY. A behavioral ratchet imports a fn from '@/...' and calls it, so it self-
// validates -- UNLESS that fn loses all its production references (deleted,
// orphaned, replaced by a twin). Then the ratchet still passes but pins an
// invariant on code nothing runs: a VACUOUS green (the #1572 class -- the dead
// processBalanceVideoOperation fn carried a ratchet that measured nothing).
// `tri ratchet-audit` checks self-check + floor PRESENCE; it does NOT check that
// the guarded fn is still LIVE. This does.
//
// For each guard test, take the fns it imports from '@/', and confirm each is
// still referenced by >= 1 production (non-test) file OUTSIDE its own definition
// file -- an import counts, which is the exact "never imported" signal that let
// #1572 be deleted. (Reference, not `name(` call-site: a false negative here
// would delete a LIVE ratchet, so the predicate stays conservative -- the first
// call-site version was a false ruler that flagged an imported-but-uncalled
// message helper.) Any 0 is a candidate "ratchet on a dead twin" -- verify by
// hand, then delete fn+ratchet (autonomous, typecheck-safe) or move the
// invariant to the live twin.
//
// Complements ratchet-audit (quality) and money-map (money census).

import { readFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

// ---- pure core (self-checkable): is `name` referenced anywhere in `corpus`? --
// corpus = the production source files OUTSIDE the fn's own definition file. A
// fn is LIVE if any production file still references it (an import counts -- that
// is the exact signal that let #1572 be deleted: "never imported"). Using a bare
// word-boundary reference (not `name(`) is deliberate: a false NEGATIVE here
// deletes a live ratchet, so the predicate is conservative -- any mention keeps
// it. This is the SAME predicate the FS layer uses, so --self-check exercises the
// shipped logic.
function isReferencedIn(name, corpus) {
  const re = new RegExp(
    '\\b' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b'
  )
  return corpus.some(src => re.test(src))
}

// symbols that are types/enums/consts, not fns we can meaningfully call-count
const NON_FN = new Set([
  'logger',
  'MyContext',
  'ModeEnum',
  'PaymentType',
  'SubscriptionType',
  'supabase',
  'inngest',
  'BalanceOperationResult',
])
function looksLikeFn(sym) {
  return /^[a-z][A-Za-z0-9]+$/.test(sym) && !NON_FN.has(sym)
}

function importedAtSymbols(testSrc) {
  const syms = new Set()
  const re = /import\s+\{([^}]+)\}\s+from\s+'(@\/[^']+)'/g
  let m
  while ((m = re.exec(testSrc))) {
    for (let s of m[1].split(',')) {
      s = s
        .trim()
        .replace(/^type\s+/, '')
        .split(/\s+as\s+/)[0]
        .trim()
      if (s && looksLikeFn(s)) syms.add(s)
    }
  }
  return [...syms]
}

// The file that DEFINES the fn (so we can exclude it: a def references its own
// name and must not count as a live consumer).
function defFile(name) {
  try {
    const out = execSync(
      `grep -rlE 'export (async )?(function|const|let) ${name}\\b' src --include='*.ts' 2>/dev/null ` +
        `| grep -v '__tests__' | head -1`,
      { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 24 }
    )
    return out.trim()
  } catch {
    return ''
  }
}

// Count production (non-test) files that REFERENCE the fn, excluding its own def
// file. > 0 => live (imported/used somewhere). 0 => orphan (#1572 signature).
function liveRefCount(name) {
  const def = defFile(name)
  try {
    const out = execSync(
      `grep -rlE '\\b${name}\\b' src --include='*.ts' 2>/dev/null | grep -v '__tests__'`,
      { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 24 }
    )
    return out
      .split('\n')
      .filter(Boolean)
      .filter(f => f !== def && resolve(ROOT, f) !== resolve(ROOT, def)).length
  } catch {
    return 0
  }
}

function guardList() {
  const g = readFileSync(resolve(ROOT, '.claude/loop-opus/guards.mjs'), 'utf8')
  const out = []
  const re = /'([^']+\.test\.ts)'/g
  let m
  while ((m = re.exec(g))) out.push(m[1])
  return out
}

function selfCheck() {
  const dead = 'processBalanceVideoOperationGhost'
  const live = 'processBalanceVideoOperationHelper'
  // an IMPORT-only reference must count as live (the #1572 signal is "imported"),
  // so the live corpus deliberately contains no call, only an import line.
  const corpus = [`import { ${live} } from '@/x'`, `logger.info('x')`]
  const ok1 = isReferencedIn(live, corpus) === true
  const ok2 = isReferencedIn(dead, corpus) === false
  // import extraction must pick fns and drop types/enums
  const syms = importedAtSymbols(
    `import { checkBalanceVideoOperationHelper, type BalanceOperationResult, ModeEnum } from '@/x'`
  )
  const ok3 =
    syms.includes('checkBalanceVideoOperationHelper') &&
    !syms.includes('BalanceOperationResult') &&
    !syms.includes('ModeEnum')
  const pass = ok1 && ok2 && ok3
  console.log(
    `fn-liveness self-check: ${pass ? 'PASS' : 'FAIL'}` +
      ` (live-detected=${ok1} dead-detected=${ok2} import-filter=${ok3})`
  )
  process.exit(pass ? 0 : 1)
}

function main() {
  if (process.argv.includes('--self-check')) return selfCheck()
  const tests = guardList()
  let deadFound = 0
  let scanned = 0
  for (const t of tests) {
    const abs = resolve(ROOT, t)
    if (!existsSync(abs)) continue
    const syms = importedAtSymbols(readFileSync(abs, 'utf8'))
    if (!syms.length) continue // structural ratchet -- nothing to liveness-check
    for (const sym of syms) {
      scanned++
      const n = liveRefCount(sym)
      if (n === 0) {
        deadFound++
        console.log(`DEAD-FN  ${sym}  (0 production importers/refs)  <- ${t}`)
      }
    }
  }
  if (deadFound === 0) {
    console.log(
      `tri fn-liveness: ${scanned} imported fns across behavioral ratchets -- all LIVE.`
    )
    process.exit(0)
  }
  console.log(
    `\ntri fn-liveness: ${deadFound} candidate dead-fn ratchet(s). Verify by hand: a truly dead fn + its ratchet delete together (typecheck-safe); if the invariant matters, move it to the live twin.`
  )
  process.exit(1)
}

main()
