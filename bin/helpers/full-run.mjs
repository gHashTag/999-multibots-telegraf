#!/usr/bin/env node
/**
 * tri full-run [render|player|both] -- a full test run that says where it ran.
 *
 * Loop turn 4 (2026-09-27): a background "full render run" reported 178 files
 * and 1565 tests, all green. That was the PLAYER's suite; the render has 410
 * files. The summary was filtered to its totals, so nothing in it said which
 * package had run, and a green that proved nothing about the render almost
 * went into a PR comment as the render's gate.
 *
 * This runs each package's own vitest from its own directory, prints the RUN
 * line (the path vitest itself reports) beside the totals and the failing
 * files, and fails when the path is not the package asked for.
 */
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..', '..')
const PACKAGES = {
  render: join(ROOT, 'apps', 'vibee-editor', 'render'),
  player: join(ROOT, 'apps', 'vibee-editor', 'player'),
}
const which = process.argv[2] ?? 'render'
const names = which === 'both' ? ['render', 'player'] : [which]
if (!names.every(n => n in PACKAGES)) {
  console.error('usage: tri full-run [render|player|both]')
  process.exit(2)
}

let bad = 0
for (const name of names) {
  const dir = PACKAGES[name]
  const r = spawnSync('npx', ['vitest', 'run'], {
    cwd: dir,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    timeout: 20 * 60 * 1000,
  })
  const out = `${r.stdout ?? ''}\n${r.stderr ?? ''}`
  // vitest colours its output; the words are what we read.
  const plain = out.replace(/\x1b\[[0-9;]*m/g, '')
  const ran = /RUN\s+v\S+\s+(\S+)/.exec(plain)?.[1] ?? '(no RUN line)'
  const files = /Test Files\s+(.+)/.exec(plain)?.[1]?.trim() ?? '?'
  const tests = /Tests\s+(\d.+)/.exec(plain)?.[1]?.trim() ?? '?'
  const failing = [
    ...new Set([...plain.matchAll(/^\s*FAIL\s+(\S+)/gm)].map(m => m[1])),
  ]
  const here = ran === dir
  const ok = here && r.status === 0 && failing.length === 0
  console.log(`== ${name}: ${ok ? 'green' : 'RED'}`)
  console.log(`   ran in  ${ran}${here ? '' : `   <-- NOT ${dir}`}`)
  console.log(`   files   ${files}`)
  console.log(`   tests   ${tests}`)
  for (const f of failing) console.log(`   FAIL    ${f}`)
  if (!ok) bad++
}
process.exit(bad ? 1 : 0)
