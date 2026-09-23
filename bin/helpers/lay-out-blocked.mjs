#!/usr/bin/env node
/**
 * LAY OUT THE BLOCKED EVAL SPECS SO `t27c backlog` CAN READ THEM.
 *
 * backlog answers the only question worth asking about this backend -- how many
 * DISTINCT defect classes stand between a spec and a clean compile -- but it
 * reads a spec TREE, and the eval set is rows in a .jsonl file.
 *
 * ── AND THE SPECS MUST LIVE INSIDE A REAL specs/ ROOT ─────────────────────
 *
 * Not a detail. t27c walks up from a spec looking for `specs/`; from anywhere
 * else it finds nothing, silently drops every `use`, and the spec then fails on
 * a missing symbol. Measured on specs/isa/registers.t27: from the tree it is a
 * struct-initialization error, from /tmp an "undeclared identifier". Same file,
 * different diagnosis -- and the diagnosis is exactly what backlog counts.
 *
 * Only BLOCKED specs are laid out. A runnable one has depth zero by definition,
 * and including it would dilute the distribution the caller is reading.
 */
import { readFile, writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'

const run = promisify(execFile)
const T27C = process.env.T27C || 't27c'
const BIG = { maxBuffer: 256 * 1024 * 1024, timeout: 300_000 }

const [, , datasetPath, outDir] = process.argv
if (!datasetPath || !outDir) {
  console.error('lay-out-blocked.mjs <eval.jsonl> <каталог>')
  process.exit(2)
}

const rows = (await readFile(datasetPath, 'utf8'))
  .split('\n')
  .filter(Boolean)
  .map(JSON.parse)

await rm(outDir, { recursive: true, force: true })
await mkdir(outDir, { recursive: true })

let blocked = 0
for (const [i, r] of rows.entries()) {
  const spec = r.messages[2].content
  const probe = await mkdtemp(join(outDir, 'p-'))
  const f = join(probe, 's.t27')
  await writeFile(f, spec)
  let out = ''
  try {
    const x = await run(T27C, ['test-report', f], BIG)
    out = x.stdout + x.stderr
  } catch (e) {
    out = String(e.stdout || '') + String(e.stderr || '')
  }
  await rm(probe, { recursive: true, force: true })
  if (/BLOCKED/.test(out)) {
    await writeFile(join(outDir, String(i).padStart(2, '0') + '.t27'), spec)
    blocked++
  }
}

if (blocked === 0) {
  console.error(
    'Ни один спек не заблокирован — мерить глубину не на чем.\n' +
      'Это либо очень хорошая новость, либо T27C указывает не туда.'
  )
  process.exit(1)
}
console.log(`  заблокированных: ${blocked} из ${rows.length}`)
