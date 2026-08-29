#!/usr/bin/env node
// loop-fable: regression guard for the in-memory OOM class.
// 999-multibots runs every bot in ONE process on Telegraf's default
// MemorySessionStore (bot.ts session() with no store/TTL/eviction). A scene that
// collects uploaded photos as full Buffers in ctx.session.<array> via .push(),
// with a per-image SIZE cap but no COUNT cap, lets a user spam photos until RSS
// climbs and the container OOM-kills every bot. Closed in three scenes:
// morphingWizard #1145, aiPhotoshopScene #1147, trainFluxModelWizard #1154.
//
// Rule: every ctx.session.<array>.push site must have a count cap in the same
// file -- a `session.<array> ... >= MAX_...` guard. ALLOWLIST holds arrays that
// are safe without a cap, with a reason.
//
// Run: node .claude/loop-fable/audit-session-array-cap.mjs
// Exit: 1 - an uncapped session-array collector (regression / new collector);
//       2 - could not scan src; 0 - clean. Mutates nothing.
import fs from 'node:fs'
import path from 'node:path'

const ROOT = 'src'
if (!fs.existsSync(ROOT)) {
  console.error('missing dir', ROOT)
  process.exit(2)
}

// array name -> why it is safe without a count cap
const ALLOWLIST = new Map([
  // Pushed once per PAID generation (balance-gated, not free spam); each entry
  // is small metadata (prompt/URLs), not a 10MB upload Buffer. Not the OOM class.
  [
    'savedAiPhotoshopResults',
    'paid-generation-bounded metadata, not a raw Buffer',
  ],
])

const walk = d =>
  fs.readdirSync(d, { withFileTypes: true }).flatMap(e => {
    const p = path.join(d, e.name)
    if (e.isDirectory()) return e.name === '__tests__' ? [] : walk(p)
    return e.isFile() && p.endsWith('.ts') && !p.endsWith('.test.ts') ? [p] : []
  })

const PUSH = /ctx\.session\.([A-Za-z0-9_]+)\.push\(/g

const findings = []
for (const f of walk(ROOT)) {
  const src = fs.readFileSync(f, 'utf8')
  const arrays = new Set([...src.matchAll(PUSH)].map(m => m[1]))
  for (const arr of arrays) {
    if (ALLOWLIST.has(arr)) continue
    // capped if some `session.<arr> ... >= MAX_` appears within a small window
    const capped = new RegExp(
      `session\\.${arr}\\b[\\s\\S]{0,200}>=\\s*MAX_`
    ).test(src)
    if (!capped) findings.push({ f, arr })
  }
}

if (findings.length === 0) {
  console.log(
    'OK session-array-cap: every ctx.session.<array>.push collector is count-capped'
  )
  process.exit(0)
}
console.error(
  'FOUND: ctx.session.<array>.push without a count cap (in-memory OOM class)'
)
for (const { f, arr } of findings) {
  console.error(
    `  ${f}  ->  ctx.session.${arr}.push (no cap: session.${arr} ... >= MAX_)`
  )
}
console.error(
  'Add a MAX_ count cap that rejects before the push (see #1145/#1147/#1154),'
)
console.error(
  'or add the array to ALLOWLIST with a reason if it is genuinely bounded.'
)
process.exit(1)
