#!/usr/bin/env node
/**
 * tri image-gate -- the player's deploy gate, run here before a merge.
 *
 * Loop turn 8 (27.09.2026): the player's image build (apps/vibee-editor
 * Dockerfile, stage `test`) refused #3135 on a control in
 * src/__tests__/embed-guest-panel.test.tsx that another merge had turned red
 * an hour earlier. My own gate was a full run BEFORE merging main and a
 * subset after it -- the subset left out src/__tests__. The deploy's gate is
 * not "some tests": it is `tsc` and scripts/test-gate.mjs, and this runs
 * exactly those, in the player, and records the verdict for `tri gate`.
 */
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..', '..')
const PLAYER = join(ROOT, 'apps', 'vibee-editor', 'player')
const run = (cmd, args) =>
  spawnSync(cmd, args, {
    cwd: PLAYER,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  })

const tsc = run('npx', ['tsc', '--noEmit', '-p', '.'])
let ok = tsc.status === 0
let detail = ok ? 'tsc clean' : 'tsc FAILED'
if (ok) {
  const gate = run('node', ['scripts/test-gate.mjs'])
  const out = `${gate.stdout ?? ''}\n${gate.stderr ?? ''}`
  const verdict = /test gate: (\S+)[^\n]*/.exec(out)?.[0] ?? '(no verdict line)'
  ok = gate.status === 0
  detail = `tsc clean; ${verdict}`
} else {
  console.log(
    `${tsc.stdout ?? ''}${tsc.stderr ?? ''}`.split('\n').slice(0, 20).join('\n')
  )
}
console.log(`== player image gate: ${ok ? 'green' : 'RED'} -- ${detail}`)
spawnSync('node', [
  join(ROOT, 'bin', 'helpers', 'gate.mjs'),
  'record',
  'image-gate player',
  ok ? 'ok' : 'fail',
  detail,
])
process.exit(ok ? 0 : 1)
