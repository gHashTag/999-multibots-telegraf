#!/usr/bin/env node
//
// ratchets — one exit-code check across every gated SAFETY-CLASS ratchet.
//
// WHY. Over iterations the loop closed five recurrent bug classes and, crucially,
// GATED each with a vitest ratchet that runs in `bun run verify` (a guard that is
// not in the gate is not a guard -- #1388/#1390). This command is their single
// front door: it names each class + its ratchet file, runs them by EXIT CODE
// (never grep -- a false-ruler trap the loop paid for repeatedly), and is the
// fast pre/post-work safety check for the loop and any future agent.
//
// Exit: whatever vitest returns (0 = all green). Authoritative; the printed
// inventory is just context.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'

const CLASSES = [
  [
    'double-charge (double-tap in-flight guard)',
    'src/__tests__/scenes/paid-wizard-guard-ratchet.test.ts',
  ],
  [
    'scene-id shadowing (last-writer-wins)',
    'src/__tests__/scenes/duplicate-scene-id-ratchet.test.ts',
  ],
  [
    'unbilled-paid (discarded charge result)',
    'src/__tests__/scenes/charge-result-checked-ratchet.test.ts',
  ],
  [
    'in-memory OOM (session-array Buffer cap)',
    'src/__tests__/scenes/session-array-cap-ratchet.test.ts',
  ],
  [
    'cross-bot misdelivery (singleton this.bot)',
    'src/__tests__/scenes/crossbot-delivery-ratchet.test.ts',
  ],
  [
    'cache-invalidation isolated (committed-charge false-negative)',
    'src/__tests__/money/cache-invalidation-isolated-ratchet.test.ts',
  ],
]

const missing = CLASSES.filter(([, f]) => !fs.existsSync(f)).map(([, f]) => f)
console.log('\n  gated safety-class ratchets:\n')
for (const [name, f] of CLASSES) {
  const mark = fs.existsSync(f) ? ' ' : '?'
  console.log(`   [${mark}] ${name}\n        ${f}`)
}
if (missing.length) {
  console.error(
    `\n  MISSING ratchet file(s) -- a gated class lost its guard:\n    ${missing.join('\n    ')}\n`
  )
  process.exit(1)
}
console.log('\n  running them by exit code (vitest)...\n')
const r = spawnSync('npx', ['vitest', 'run', ...CLASSES.map(([, f]) => f)], {
  stdio: 'inherit',
})
process.exit(r.status ?? 1)
