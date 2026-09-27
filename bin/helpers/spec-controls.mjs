#!/usr/bin/env node
/**
 * tri spec-controls <spec.t27> <controls.json> -- negative controls of a t27
 * spec in one command (skill t27-spec-first).
 *
 * A spec's own tests pass; the question is whether they can FAIL. Each
 * control breaks one rule of the spec on purpose; the spec's tests must go
 * red. On 27.09.2026 this was done by hand twice in one loop (sed, t27c
 * test-report, read the table, copy back), and the first binding of
 * crm-duet showed why it matters: its state_after vectors passed under a
 * mutation the host test later caught.
 *
 * Nothing in either repository is touched: the spec is copied into a
 * temporary directory and each control is applied to the copy. The verdict
 * comes from the report's TABLE -- `t27c test-report` exits 0 with failures.
 * A control that stops the spec compiling is "blocked", not "caught": a spec
 * that no longer builds proves nothing about its tests.
 *
 * controls.json: [{"name": "...", "from": "...", "to": "..."}, ...]
 * Zig: on PATH, or its directory in T27_ZIG_DIR. t27c: T27C, or
 * /home/user/t27/target/release/t27c.
 */
import { execFileSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, delimiter, join } from 'node:path'
import { readTestReport } from '../../scripts/check-t27-specs.mjs'

const [spec, list] = process.argv.slice(2)
if (!spec || !list) {
  console.error('usage: tri spec-controls <spec.t27> <controls.json>')
  process.exit(2)
}
const T27C = process.env.T27C || '/home/user/t27/target/release/t27c'
if (!existsSync(T27C)) {
  console.error(
    `no t27c at ${T27C} -- cargo build --release in a t27 checkout, or set T27C`
  )
  process.exit(2)
}
const env = { ...process.env }
if (process.env.T27_ZIG_DIR)
  env.PATH = `${process.env.T27_ZIG_DIR}${delimiter}${env.PATH}`

const controls = JSON.parse(readFileSync(list, 'utf8'))
const text = readFileSync(spec, 'utf8')
for (const [i, c] of controls.entries()) {
  const n = text.split(c.from).length - 1
  if (n !== 1) {
    console.error(
      `#${i + 1} ${c.name ?? ''}: \`from\` occurs ${n} times, need 1`
    )
    process.exit(2)
  }
}

const dir = mkdtempSync(join(tmpdir(), 'spec-controls-'))
const copy = join(dir, basename(spec))
const report = () => {
  let out = ''
  try {
    out = execFileSync(T27C, ['test-report', copy], {
      encoding: 'utf8',
      stdio: 'pipe',
      env,
    })
  } catch (e) {
    out = String(e.stdout || '') + String(e.stderr || '')
  }
  return { out, ...readTestReport(out) }
}

let missed = 0
try {
  copyFileSync(spec, copy)
  const base = report()
  if (/zig not on PATH/.test(base.out)) {
    console.error(
      'zig is not on PATH: set T27_ZIG_DIR to the directory holding zig 0.16'
    )
    process.exit(2)
  }
  if (base.tests === null || base.fail !== 0) {
    console.error(
      `the spec is not green as it stands (tests ${base.tests}, FAIL ${base.fail}): fix it first`
    )
    process.exit(2)
  }
  console.log(`-- ${base.tests} tests pass as written --`)
  for (const [i, c] of controls.entries()) {
    writeFileSync(copy, text.replace(c.from, c.to))
    const r = report()
    const label = c.name ?? c.from.trim().slice(0, 60)
    if (r.tests === null) {
      missed++
      console.log(`BLOCKED   #${i + 1} ${label} (the spec no longer compiles)`)
    } else if (r.fail > 0) {
      console.log(`caught    #${i + 1} ${label}: ${r.failed.join('; ')}`)
    } else {
      missed++
      console.log(`MISSED    #${i + 1} ${label}`)
    }
  }
} finally {
  rmSync(dir, { recursive: true, force: true })
}
console.log(`-- ${controls.length - missed} of ${controls.length} caught --`)
if (missed)
  console.log(
    'a missed control is a rule the spec states and never tests: add the vector.'
  )
process.exit(missed ? 1 : 0)
