#!/usr/bin/env node
/**
 * CAN A DEAD MATCHER PASS THIS GATE.
 *
 * A counting gate scans the repository and then bounds what it found -- a
 * ceiling on a debt, or an allowlist the findings must not exceed. Every one
 * of them shares a failure mode: if the matcher stops matching, the scan
 * returns nothing, the debt is zero, and every bound is satisfied. The gate
 * goes green at the exact moment it goes blind.
 *
 * A ceiling is satisfied by zero. An allowlist comparison is satisfied by an
 * empty diff. Neither notices. Only a FLOOR on the scanned population does:
 * an assertion that the walk found something, checked before the bound.
 *
 * This narrows the reading rather than proving anything. Whether an assertion
 * is really on the SCAN, and not on a constant defined a few lines above in
 * the test, is a question about meaning; the matcher below only sees shape. So
 * its verdicts are compared against a file-by-file reading via `--calibrate`,
 * and BOTH error directions are printed. The tool this pattern came from
 * opened by making thirty false accusations, and its raw first number would
 * have been published as somebody else's defect.
 *
 * Usage:  node scripts/gate-liveness.cjs
 *         node scripts/gate-liveness.cjs --self-check
 *         node scripts/gate-liveness.cjs --calibrate <census.json>
 */

const fs = require('fs')
const path = require('path')
const { census } = require('./lib/read-census.cjs')
const calib = require('./lib/calibrate.cjs')

const ROOT = path.resolve(__dirname, '..')
const TESTS = path.join(ROOT, 'src', '__tests__')

/** It reads the repository rather than only its own fixtures. */
const SCANS =
  /readdirSync|execFileSync|execSync|readFileSync\([^)]*(?:join|resolve)/

/** It bounds what it found: a ceiling, a fixed length, or a named allowlist. */
const BOUNDS =
  /toBeLessThanOrEqual\(\s*\d|toBeLessThan\(\s*\d|\.length\)\.toBe\(\s*\d|toHaveLength\(\s*\d|const (?:KNOWN|ALLOW|EXPECTED|BASELINE|WAIVED)/

/**
 * A FLOOR on what was found.
 *
 * `toContain` counts: naming a member that must always be present is a floor
 * with a specific witness, and it is strictly stronger than "more than zero"
 * -- a matcher that finds the wrong things still fails it.
 */
const FLOOR = [
  /toBeGreaterThan(?:OrEqual)?\(/,
  /not\.toHaveLength\(\s*0\s*\)/,
  /\.toContain\(/,
  /not\.toEqual\(\s*\[\s*\]\s*\)/,
  // Set equality against something NON-empty is a floor, and a strong one:
  // `expect(writerFiles(ROOT)).toEqual(Object.keys(REGISTRY).sort())` fails on
  // an empty walk because [] does not equal ten names. The empty spellings
  // `toEqual([])` and `toEqual({})` are the BOUND, not a floor, and are
  // excluded -- that difference was the detector's single miss against the
  // reading, and the reading was right.
  /\.toEqual\(\s*(?!\[\s*\]|\{\s*\})/,
]

function testFiles(c, counter) {
  const out = []
  const walk = dir => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (p.endsWith('.test.ts')) {
        if (counter) counter.tried++
        const raw = c.read1(p)
        if (raw !== null) out.push({ file: path.relative(ROOT, p), raw })
      }
    }
  }
  walk(TESTS)
  return out
}

const isGate = raw => SCANS.test(raw) && BOUNDS.test(raw)
const hasFloor = raw => FLOOR.some(re => re.test(raw))

function selfCheckMe() {
  const fail = why => {
    console.error(`самопроверка не прошла: ${why}`)
    process.exit(2)
  }
  const gate = `
    const files = fs.readdirSync(dir)
    expect(debt.length).toBeLessThanOrEqual(8)
  `
  if (!isGate(gate)) fail('счётный гейт не распознан')
  if (hasFloor(gate)) fail('гейт без пола объявлен защищённым')

  const guarded = gate + '\n    expect(files.length).toBeGreaterThan(30)\n'
  if (!hasFloor(guarded)) fail('пол не распознан')

  const witness = gate + "\n    expect(found).toContain('known member')\n"
  if (!hasFloor(witness)) fail('пол-свидетель (toContain) не распознан')

  const setEquality = gate + '\n    expect(scanned).toEqual(KNOWN_TEN_NAMES)\n'
  if (!hasFloor(setEquality))
    fail('равенство непустому множеству не признано полом')

  // And the bound must NOT be mistaken for a floor. `toEqual([])` is what
  // almost every one of these gates asserts about its findings; counting it
  // would declare all thirty protected and the tool would measure nothing.
  const bound = 'const found = scan()\nexpect(found).toEqual([])\n'
  if (hasFloor(bound)) fail('пустое ожидание принято за пол')
  const emptyObject = 'expect(found).toEqual({})\n'
  if (hasFloor(emptyObject)) fail('пустой объект принят за пол')

  // Negative controls. A test that neither scans nor bounds is not a gate,
  // and a scan with no bound is not one either -- counting those would put
  // hundreds of ordinary tests into the population and make the debt figure
  // meaningless.
  const ordinary = 'expect(add(2, 2)).toBe(4)'
  if (isGate(ordinary)) fail('обычный тест принят за счётный гейт')
  const scanOnly =
    'const files = fs.readdirSync(dir)\nexpect(files[0]).toBe("a")'
  if (isGate(scanOnly)) fail('скан без границы принят за гейт')
  const boundOnly = 'expect(xs.length).toBeLessThanOrEqual(3)'
  if (isGate(boundOnly)) fail('граница без скана принята за гейт')

  console.log(
    'self-check OK: gate recognised, floor and witness recognised, three non-gates rejected'
  )
}

function verdicts() {
  const c = census('gate-liveness')
  const counter = { tried: 0 }
  const all = testFiles(c, counter)
  const gates = all.filter(t => isGate(t.raw))
  const map = new Map(gates.map(g => [g.file, hasFloor(g.raw)]))
  return { c, counter, gates, map }
}

function main() {
  const argv = process.argv.slice(2)
  if (argv.includes('--self-check')) return selfCheckMe()

  const ci = argv.indexOf('--calibrate')
  const { c, counter, gates, map } = verdicts()
  if (ci !== -1) {
    return calib.report(
      calib.compare(calib.load(argv[ci + 1]), map),
      'gate liveness'
    )
  }

  c.report(counter.tried)
  const without = gates.filter(g => !map.get(g.file))
  console.log(`\nсчётных гейтов: ${gates.length}`)
  console.log(
    `  с полом (переживут мёртвый матчер): ${gates.length - without.length}`
  )
  console.log(`  БЕЗ пола:                           ${without.length}`)
  if (gates.length === 0) {
    console.log('НОЛЬ гейтов — это не чистота, а сломанный обход')
    process.exit(2)
  }
  for (const g of without) console.log(`  без пола: ${g.file}`)
}

main()
