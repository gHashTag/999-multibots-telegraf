#!/usr/bin/env node
/**
 * Does a numeric floor in a test still bind anything?
 *
 * `expect(x.length).toBeGreaterThan(20)` looks like a guard. It is only a
 * guard if 20 sits near the truth. If the real value is 4000, the floor can
 * never fail, and it has been reporting success for years while checking
 * nothing. That kind of number is usually written from imagination rather
 * than from a measurement -- the author needed "some floor" and typed one.
 *
 * The test is falsification, not reading: raise the floor and see whether the
 * assertion notices. Green after a 10x raise means the original number had at
 * least an order of magnitude of slack.
 *
 *   BINDING  the raised floor fails -- the number is close to the truth
 *   SLACK    the raised floor still passes -- the original guards nothing
 *   BROKEN   the file fails BEFORE mutation, so the probe cannot judge it
 *
 * The third outcome is the point of this file having three of them. A test
 * that is already red answers neither question, and collapsing it into SLACK
 * would invent a finding out of an unrelated failure.
 *
 * Usage:  node scripts/floor-slack.cjs [pathGlobFragment] [--all]
 *         node scripts/floor-slack.cjs --self-check
 */

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const { matchCode } = require('./lib/blank-code.cjs')
const { census } = require('./lib/read-census.cjs')

const ROOT = path.resolve(__dirname, '..')
const FLOOR = /toBeGreaterThan(?:OrEqual)?\((\d+)\)/g

/** Test files under src/__tests__, optionally narrowed by a path fragment. */
function testFiles(fragment) {
  const out = []
  const walk = dir => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (p.endsWith('.test.ts')) out.push(p)
    }
  }
  walk(path.join(ROOT, 'src', '__tests__'))
  return fragment ? out.filter(f => f.includes(fragment)) : out
}

/**
 * Floors worth probing: >0 and >1 are anti-vacuity checks, not measurements,
 * and raising them would only prove that a list has fewer than ten items.
 */
function floorsIn(raw, includeTrivial) {
  return matchCode(raw, FLOOR)
    .map(m => ({ index: m.index, text: m[0], n: Number(m[1]) }))
    .filter(f => includeTrivial || f.n > 1)
}

function runFile(file) {
  try {
    execFileSync('npx', ['vitest', 'run', path.relative(ROOT, file)], {
      cwd: ROOT,
      stdio: 'pipe',
      timeout: 180000,
    })
    return true
  } catch {
    return false
  }
}

function probe(file, includeTrivial, log) {
  const original = fs.readFileSync(file, 'utf8')
  const floors = floorsIn(original, includeTrivial)
  if (floors.length === 0) return []

  // A file already red answers nothing about its floors, so ask first.
  if (!runFile(file)) {
    return floors.map(f => ({ file, n: f.n, verdict: 'BROKEN' }))
  }

  const results = []
  for (const f of floors) {
    const raised = f.text.replace(String(f.n), String(f.n * 10 + 10))
    const mutated =
      original.slice(0, f.index) +
      raised +
      original.slice(f.index + f.text.length)
    if (mutated === original) {
      // Never score a file the rewrite failed to change.
      results.push({ file, n: f.n, verdict: 'BROKEN' })
      continue
    }
    fs.writeFileSync(file, mutated)
    try {
      const stillGreen = runFile(file)
      results.push({ file, n: f.n, verdict: stillGreen ? 'SLACK' : 'BINDING' })
      if (log) log(`  >${f.n} -> ${stillGreen ? 'SLACK' : 'BINDING'}`)
    } finally {
      fs.writeFileSync(file, original)
    }
  }
  return results
}

/**
 * Both outcomes must be reachable, or the probe is decoration. The fixture
 * holds one floor that sits on the truth and one with three orders of slack.
 */
function selfCheck() {
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'floor-'))
  const file = path.join(ROOT, 'src', '__tests__', `__floorSelfCheck.test.ts`)
  fs.writeFileSync(
    file,
    [
      "import { describe, it, expect } from 'vitest'",
      "describe('floor self check', () => {",
      "  it('binding', () => { expect([1, 2, 3].length).toBeGreaterThan(2) })",
      "  it('slack', () => { expect([1, 2, 3].length).toBeGreaterThan(2) })",
      '})',
      '',
    ].join('\n')
  )
  try {
    const res = probe(file, false, null)
    const verdicts = res.map(r => r.verdict)
    // Both floors are >2 against a length of 3: raising to 30 must fail both.
    if (verdicts.length !== 2 || verdicts.some(v => v !== 'BINDING')) {
      console.error(
        `self-check FAILED: expected two BINDING, got ${verdicts.join(',')}`
      )
      process.exit(2)
    }
    // And a floor with real slack must come back SLACK, or the probe only
    // ever says BINDING and its agreement with reality means nothing.
    fs.writeFileSync(
      file,
      [
        "import { describe, it, expect } from 'vitest'",
        "describe('floor self check', () => {",
        "  it('slack', () => { expect(10000).toBeGreaterThan(5) })",
        '})',
        '',
      ].join('\n')
    )
    const slack = probe(file, false, null).map(r => r.verdict)
    if (slack.length !== 1 || slack[0] !== 'SLACK') {
      console.error(`self-check FAILED: expected SLACK, got ${slack.join(',')}`)
      process.exit(2)
    }
    console.log('self-check OK: BINDING and SLACK are both reachable')
  } finally {
    fs.rmSync(file, { force: true })
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

function main() {
  const argv = process.argv.slice(2)
  if (argv.includes('--self-check')) return selfCheck()
  const includeTrivial = argv.includes('--all')
  const fragment = argv.find(a => !a.startsWith('--'))

  const files = testFiles(fragment)
  const c = census('floor-slack')
  const all = []
  for (const f of files) {
    const raw = c.read1(f)
    if (raw === null || floorsIn(raw, includeTrivial).length === 0) continue
    console.log(path.relative(ROOT, f))
    all.push(...probe(f, includeTrivial, m => console.log(m)))
  }
  c.report(files.length)

  const by = v => all.filter(r => r.verdict === v)
  console.log(`\nfloors probed: ${all.length}`)
  console.log(`  BINDING: ${by('BINDING').length}`)
  console.log(`  SLACK:   ${by('SLACK').length}`)
  console.log(`  BROKEN:  ${by('BROKEN').length}   (already red -- not judged)`)
  for (const r of by('SLACK')) {
    console.log(`SLACK  ${path.relative(ROOT, r.file)}  >${r.n}`)
  }
  // Naming the unjudged files matters as much as naming the findings: a red
  // test is a fact about the repository, and hiding it inside a count would
  // let this probe report a clean sweep over ground it never covered.
  for (const f of new Set(by('BROKEN').map(r => r.file))) {
    console.log(`BROKEN ${path.relative(ROOT, f)}  (red before mutation)`)
  }
}

main()
