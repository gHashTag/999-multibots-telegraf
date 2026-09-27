#!/usr/bin/env node
/**
 * tri spec-check <spec.t27> [controls.json] [--seal]
 *
 * The whole local gate of a spec, one line of verdict:
 *   "crm-story-reel.t27: 30/30, 0 of 55 vacuous, 31/31 controls, sealed"
 *
 * WHY. Every loop turn ran the same four steps by hand, and each has a trap
 * that cost a round on 27.09.2026:
 *   - `t27c test-report` without zig on PATH answers BLOCKED with code 0, and
 *     a FAIL in its table is code 0 too -- the table is the verdict;
 *   - `validate-vacuity` takes a DIRECTORY (`--specs-dir`), not a file: the
 *     spec is copied into an empty one so the count is this spec's alone;
 *   - controls need the same zig (T27_ZIG_DIR), and `tri spec-controls`
 *     already records its verdict;
 *   - `seal --save` writes under .trinity/ of the repo it runs in, so it runs
 *     from the spec's own checkout.
 *
 * Zig: on PATH, or its directory in T27_ZIG_DIR. t27c: T27C, or
 * /home/user/t27/target/release/t27c. The verdict goes to `tri gate`.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import {
  basename,
  delimiter,
  dirname,
  join,
  relative,
  resolve,
} from 'node:path'
import { readTestReport } from '../../scripts/check-t27-specs.mjs'

const HERE = import.meta.dirname
// tri gate: the tree as this check found it; record compares it at the end.
process.env.TRI_GATE_START = spawnSync(
  'node',
  [join(HERE, 'gate.mjs'), 'tree'],
  { encoding: 'utf8' }
).stdout.trim()

const args = process.argv.slice(2)
const seal = args.includes('--seal')
const [spec, list] = args.filter(a => a !== '--seal')
if (!spec || !existsSync(spec)) {
  console.error('usage: tri spec-check <spec.t27> [controls.json] [--seal]')
  process.exit(2)
}
const T27C = process.env.T27C || '/home/user/t27/target/release/t27c'
if (!existsSync(T27C)) {
  console.error(`no t27c at ${T27C} -- cargo build --release, or set T27C`)
  process.exit(2)
}
const env = { ...process.env }
if (process.env.T27_ZIG_DIR)
  env.PATH = `${process.env.T27_ZIG_DIR}${delimiter}${env.PATH}`
const run = (cmd, argv, opts = {}) => {
  const r = spawnSync(cmd, argv, { encoding: 'utf8', env, ...opts })
  return { code: r.status, out: `${r.stdout ?? ''}\n${r.stderr ?? ''}` }
}

const parts = []
let ok = true

// 1. The spec's own tests -- by the table, never by the exit code.
const tr = run(T27C, ['test-report', spec])
if (/BLOCKED/.test(tr.out)) {
  console.log(tr.out.trim())
  console.log(
    'BLOCKED is not green: put zig on PATH or its directory in T27_ZIG_DIR'
  )
  process.exit(2)
}
const table = readTestReport(tr.out)
if (table.tests === null || table.fail === null) {
  console.log(tr.out.trim())
  console.log('no test table in the report: nothing was measured')
  process.exit(2)
}
parts.push(`${table.tests - table.fail}/${table.tests}`)
if (table.fail) {
  ok = false
  for (const f of table.failed) console.log(`FAIL  ${f}`)
}

// 2. Vacuity -- of this spec alone, in a directory of its own.
const dir = mkdtempSync(join(tmpdir(), 'spec-check-'))
try {
  copyFileSync(spec, join(dir, basename(spec)))
  const v = run(T27C, ['validate-vacuity', '--specs-dir', dir])
  const m = /tests that assert nothing:\s*(\d+)\s+of\s+(\d+)/.exec(v.out)
  if (!m) {
    console.log(v.out.trim())
    console.log('no vacuity line: nothing was measured')
    process.exit(2)
  }
  parts.push(`${m[1]} of ${m[2]} vacuous`)
  if (Number(m[1]) > 0) ok = false
} finally {
  rmSync(dir, { recursive: true, force: true })
}

// 3. Negative controls, when a list is given (spec-controls records itself).
if (list) {
  const c = run('node', [join(HERE, 'spec-controls.mjs'), spec, list])
  const m = /-- (\d+) of (\d+) caught --/.exec(c.out)
  if (!m) {
    console.log(c.out.trim())
    ok = false
    parts.push('controls did not run')
  } else {
    parts.push(`${m[1]}/${m[2]} controls`)
    if (m[1] !== m[2]) {
      ok = false
      for (const l of c.out.split('\n'))
        if (/^(missed|no build)/.test(l)) console.log(l)
    }
  }
}

// 4. The seal, from the spec's own checkout.
if (seal) {
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: dirname(resolve(spec)),
    encoding: 'utf8',
  }).trim()
  const s = run(T27C, ['seal', relative(root, resolve(spec)), '--save'], {
    cwd: root,
  })
  if (s.code === 0 && /Seal saved/.test(s.out)) parts.push('sealed')
  else {
    ok = false
    console.log(s.out.trim())
    parts.push('NOT sealed')
  }
}

const line = `${basename(spec)}: ${parts.join(', ')}`
console.log(`== spec-check ${ok ? 'green' : 'RED'} -- ${line}`)
spawnSync('node', [
  join(HERE, 'gate.mjs'),
  'record',
  `spec-check ${basename(spec)}`,
  ok ? 'ok' : 'fail',
  parts.join(', '),
])
process.exit(ok ? 0 : 1)
