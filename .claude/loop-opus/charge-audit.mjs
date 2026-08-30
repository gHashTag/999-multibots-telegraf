#!/usr/bin/env node
//
// charge-audit — human-readable view of the charging-scene completeness ratchet.
//
// WHY THIS EXISTS. #1358 was a double-charge cluster; the paid-wizard-guard
// ratchet that guarded it was registry-BLIND (it only checked registered
// wizards), so textToSpeech #1356 / neuroPhotoV2 #1343 slipped, and the render
// sub-cluster #1372 stayed hidden. #1374 added a completeness ratchet whose
// population is defined INDEPENDENTLY of the registry. This command is its
// fast, human-readable face — one glance shows what is guarded, classified, or
// (in red) an unclassified charging scene.
//
// AUTHORITY. The vitest test is the gate. To avoid two-populations-one-truth
// drift, this script reads the three classification sets straight FROM the test
// file, and re-uses the SAME charge regex (kept in sync by the test, which
// fails if the regex ever finds nothing). Exit code is non-zero if any charging
// scene is unclassified, so the loop can call it as a cheap pre-check.
import fs from 'node:fs'
import path from 'node:path'

const TEST = 'src/__tests__/scenes/paid-wizard-guard-ratchet.test.ts'

const stripComments = s =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(
      /(^|[^:])\/\/.*$/gm,
      (m, p1) => p1 + ' '.repeat(m.length - p1.length)
    )

// Keep in sync with the test (the test fails if it ever matches nothing).
const CHARGE_RE =
  /updateUserBalance\([\s\S]{0,400}?MONEY_OUTCOME|processBalanceOperation\(|processBalanceVideoOperationHelper\(/

// Pull the key set of a `const NAME: Record<string,string> = { ... }` literal
// out of the test file, so classification never drifts from the gate.
const keysOf = (src, name) => {
  const m = src.match(new RegExp(name + '[^{]*\\{([\\s\\S]*?)\\n\\}'))
  if (!m) return new Set()
  return new Set([...m[1].matchAll(/'([^']+)':/g)].map(x => x[1]))
}

const testSrc = fs.readFileSync(TEST, 'utf8')
const guarded = keysOf(testSrc, 'GUARDED_PAID_WIZARDS')
const safe = keysOf(testSrc, 'SAFE_NOT_CHARGEABLE')
const tracked = keysOf(testSrc, 'KNOWN_UNGUARDED_TRACKED')

const scenes = []
const walk = dir => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p)
    else if (p.endsWith('.ts') && !p.endsWith('.test.ts')) {
      if (CHARGE_RE.test(stripComments(fs.readFileSync(p, 'utf8'))))
        scenes.push(p.split(path.sep).join('/'))
    }
  }
}
walk(path.join('src', 'scenes'))
scenes.sort()

const C = {
  g: '\x1b[32m',
  s: '\x1b[36m',
  t: '\x1b[33m',
  u: '\x1b[31m',
  z: '\x1b[0m',
}
let nG = 0,
  nS = 0,
  nT = 0,
  unclassified = []
console.log(
  `\n  charging scenes (population ${scenes.length}) — источник: ${TEST}\n`
)
for (const f of scenes) {
  const short = f.replace('src/scenes/', '')
  if (guarded.has(f)) {
    console.log(`  ${C.g}GUARDED ${C.z} ${short}`)
    nG++
  } else if (safe.has(f)) {
    console.log(`  ${C.s}SAFE    ${C.z} ${short}  (недостижимо/отключён)`)
    nS++
  } else if (tracked.has(f)) {
    console.log(`  ${C.t}TRACKED ${C.z} ${short}  (известный пробел, тикет)`)
    nT++
  } else {
    console.log(
      `  ${C.u}⚠ UNCLASSIFIED${C.z} ${short}  <- защити+зарегистрируй ИЛИ классифицируй`
    )
    unclassified.push(f)
  }
}
console.log(
  `\n  итог: ${C.g}${nG} guarded${C.z} · ${C.s}${nS} safe${C.z} · ` +
    `${C.t}${nT} tracked-gap${C.z} · ${C.u}${unclassified.length} unclassified${C.z}`
)
if (unclassified.length) {
  console.log(
    `\n  ${C.u}НАЙДЕНА НЕЗАЩИЩЁННАЯ СПИСЫВАЮЩАЯ СЦЕНА${C.z} — это класс #1358. ` +
      `Гейт (vitest) покраснеет. Чини как #1371/#1374.\n`
  )
  process.exit(1)
}
console.log(
  `\n  все списывающие сцены классифицированы. Авторитет — vitest ` +
    `${TEST.split('/').pop()} (эта команда — быстрый обзор).\n`
)
