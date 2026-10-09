#!/usr/bin/env node
/**
 * tri snapshot-diff [ref] -- what a `test-gate --save` is about to forget.
 *
 * The gate's rule for a refreshed snapshot: compare names, then check the diff
 * removes ONLY the expected ones. Done by hand twice on 2026-10-09 (comm on two
 * sorted files, then a per-file count), and the second time it caught 15 names
 * that were not renamed at all -- they were skipped on a machine without
 * ffmpeg. This prints the same table in one command.
 *
 * Per file: names that leave, names that come in. A file where more leave than
 * come in is marked LOSS: renames keep the count, deletions do not.
 *
 * Exit: 0 nothing leaves, 1 names leave (read the table), 2 could not compare.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const root = process.argv[2]
const ref = process.argv[3] || 'HEAD'
const FILE = '.test-baseline.txt'

const names = text =>
  new Set(text.split('\n').filter(l => l && !l.startsWith('#')))

let before
try {
  before = names(
    execFileSync('git', ['-C', root, 'show', `${ref}:${FILE}`], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
  )
} catch {
  console.error(`could not read ${FILE} at ${ref}`)
  process.exit(2)
}
const now = names(fs.readFileSync(path.join(root, FILE), 'utf8'))

const fileOf = id => id.split(' :: ')[0]
const byFile = new Map()
const bump = (id, key) => {
  const f = fileOf(id)
  const row = byFile.get(f) || { gone: [], came: 0 }
  if (key === 'gone') row.gone.push(id.slice(f.length + 4))
  else row.came++
  byFile.set(f, row)
}
for (const id of before) if (!now.has(id)) bump(id, 'gone')
for (const id of now) if (!before.has(id)) bump(id, 'came')

const leaving = [...byFile].filter(([, r]) => r.gone.length)
const came = [...byFile.values()].reduce((a, r) => a + r.came, 0)
console.log(
  `${FILE} against ${ref}: ${before.size} -> ${now.size} names; ` +
    `${leaving.reduce((a, [, r]) => a + r.gone.length, 0)} leave, ${came} come in`
)
for (const [f, r] of leaving.sort()) {
  const loss = r.gone.length > r.came ? '  LOSS' : ''
  console.log(`\n${f}: -${r.gone.length} +${r.came}${loss}`)
  for (const n of r.gone) console.log(`  - ${n}`)
}
if (leaving.some(([, r]) => r.gone.length > r.came))
  console.log(
    '\nLOSS: more names leave than come in. A skipped test (skipIf on a missing tool) is not a deleted one -- check before committing.'
  )
process.exit(leaving.length ? 1 : 0)
