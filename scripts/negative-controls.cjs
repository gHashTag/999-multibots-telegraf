#!/usr/bin/env node
/**
 * DOES EACH DETECTOR HAVE A NEGATIVE CONTROL -- A SAMPLE IT MUST NOT ACCUSE.
 *
 * `tri probes` already asks the other half of this question: does every probe
 * have a POSITIVE control, a sample that MUST be found. That one guards
 * against a broken matcher reporting "nothing found" over a clean sheet.
 *
 * This asks the opposite, and it is the half that hurt. Building the
 * comment-arithmetic checker took one pass to detect and FIVE to stop it
 * crying wolf: rounding read as error, truncated chains read as wrong sums,
 * a dropped minus sign, a two-pass strip that mangled its own input. Every one
 * of those looked like a finding in the repository on its first run.
 *
 *   POSITIVE control   a known-bad sample that MUST be flagged
 *   NEGATIVE control   a known-GOOD sample that must NOT be flagged
 *
 * Two positive samples are not a negative control -- that is one control
 * twice. Nor is a population count, nor an exit code, nor a comment saying a
 * control exists. A negative control asserts a NON-detection.
 *
 * THIS FILE IS ITSELF A DETECTOR, so it carries both controls and, more to the
 * point, its accuracy is MEASURED rather than asserted: `--calibrate` compares
 * its verdicts against a hand-read census of the same files and prints both
 * error directions. A detector that reports its own false-alarm rate is the
 * only kind whose findings mean anything.
 *
 * Usage:  node scripts/negative-controls.cjs
 *         node scripts/negative-controls.cjs --self-check
 *         node scripts/negative-controls.cjs --calibrate <census.json>
 */

const fs = require('fs')
const path = require('path')
const { census } = require('./lib/read-census.cjs')
const calib = require('./lib/calibrate.cjs')

const ROOT = path.resolve(__dirname, '..')

/** Same reason as LIVENESS below: one of the spellings is Russian. */
const SELF_CHECK_MARKER = new RegExp(
  ['SELF_CHECK', 'самопроверк', 'selfCheck', 'self-check'].join('|')
)

/**
 * The self-check region of a file: from the first mention of a self-check to
 * the end of that function.
 *
 * Deliberately generous at the end. Getting the region too SHORT would hide a
 * control that is really there and report a file as unguarded, and a false
 * accusation is the exact defect this tool exists to measure.
 */
function selfCheckRegion(raw) {
  const start = raw.search(/function\s+selfCheck|const\s+selfCheck|SELF_CHECK/)
  // No named function is not "no self-check". probe-charge-order runs three
  // negative controls at top level, and looking only for a function returned
  // null and reported it as unguarded -- the fourth false accusation this tool
  // made about its own subject. When there is no function to scope to, the
  // file IS the region.
  if (start === -1) return raw
  // Walk braces from the first { after the start.
  const open = raw.indexOf('{', start)
  if (open === -1) return null
  let depth = 0
  for (let i = open; i < raw.length; i++) {
    if (raw[i] === '{') depth++
    else if (raw[i] === '}') {
      depth--
      if (depth === 0) {
        const region = raw.slice(start, i + 1)
        // A region this small is not a self-check, it is a constant that
        // happened to be spelled SELF_CHECK. probe-secrets-in-db keeps its
        // clean-sample table under that name and the scope collapsed to 345
        // characters around it, hiding the very control being looked for.
        // The stated bias of this file is to be generous: too NARROW a region
        // produces a false accusation, which is the defect it measures.
        return region.length < 500 ? raw : region
      }
    }
  }
  return raw.slice(start)
}

/**
 * A NON-DETECTION assertion: the failure branch fires when something WAS found
 * on a sample the check believes is clean.
 *
 * The FIRST version looked only for `!== 0` and reported 38 detectors as
 * unguarded. Reading one refuted it immediately: probe-refund-without-charge
 * has four negative controls, spelled
 *
 *     if (hit("case 'MONEY_INCOME':", CREDIT)) fail('...')
 *
 * -- a truthiness test on a match count, no comparison to zero anywhere. The
 * tool built to measure false accusations opened by making 38 of them. That is
 * the thesis, not an embarrassment, and it is why `--calibrate` exists.
 *
 * The discriminator is the NEGATION, not the shape of the count:
 *
 *     if (!hit(sample, RE)) fail(...)     POSITIVE: must be found
 *     if (hit(sample, RE)) fail(...)      NEGATIVE: must NOT be found
 *     if (x.length === 0) fail(...)       POSITIVE
 *     if (x.length !== 0) fail(...)       NEGATIVE
 *
 * Conditions are read with a paren counter rather than a regex, because a
 * `[^)]*` group stops at the first `)` and could not cross a call inside the
 * condition -- probe-charge-order has three controls shaped
 * `if (scanText(CLEAN).length !== 0)` and was reported as having none.
 */
function failingConditions(region) {
  const out = []
  for (
    let i = region.indexOf('if (');
    i !== -1;
    i = region.indexOf('if (', i + 1)
  ) {
    let depth = 0
    let j = region.indexOf('(', i)
    const condStart = j + 1
    for (; j < region.length; j++) {
      if (region[j] === '(') depth++
      else if (region[j] === ')') {
        depth--
        if (depth === 0) break
      }
    }
    if (depth !== 0) continue
    const cond = region.slice(condStart, j)
    // Look a little way past the condition for the failure call. Bounded so a
    // distant, unrelated fail() cannot attach itself to this condition.
    const after = region.slice(j + 1, j + 260)
    // `[\s\S]`, not `[^{}]`. A failure message is usually a template literal,
    // and `${none.length}` puts braces inside the very text being scanned --
    // so a brace-excluding run stopped dead and the clause went unseen. Three
    // of the seven misses in the first calibration were this one character.
    if (
      !/^\s*\{?[\s\S]{0,240}?(?:fail\(|process\.exit\(2\)|throw new Error)/s.test(
        after
      )
    ) {
      continue
    }
    out.push(cond)
  }
  return out
}

/** Conditions that mean "it was NOT found" -- those guard the positive case. */
// The lookbehind is load-bearing: without it `== 0` matches INSIDE `!== 0`,
// and every "must not be found" assertion is misread as "must be found".
// That mistake made the first run of this rewrite reject its own fixture.
const MEANS_ABSENT = /^\s*!|(?<!!)===?\s*0|<\s*1|!\w+\.length/

/** Shapes that are about the run itself, not about accuracy. */
// Word boundaries throughout: `total` without one swallowed `negTotal`, the
// variable holding a NEGATIVE control's hit count, and classified the control
// as a liveness check.
// Built from strings rather than written as a regex literal. The repo's
// no-cyrillic hook allows Cyrillic only inside string literals, and half of
// these words are Russian; the same mistake blocked a commit one iteration ago
// and was made again here.
const LIVENESS = new RegExp(
  [
    '\\bfiles\\b',
    '\\bpopulation\\b',
    'популяц',
    'прочитан',
    '\\bread\\b',
    '\\btotal\\b',
    '\\bcorpus\\b',
    'размер',
    '\\bmembers\\b',
    'length < 2',
  ].join('|'),
  'i'
)

function hasNegativeControl(region) {
  if (!region) return { present: false, evidence: '' }
  for (const cond of failingConditions(region)) {
    if (MEANS_ABSENT.test(cond)) continue
    if (LIVENESS.test(cond)) continue
    return {
      present: true,
      evidence: cond.replace(/\s+/g, ' ').trim().slice(0, 120),
    }
  }
  // A named table of clean samples, checked in a loop rather than an if.
  // probe-secrets-in-db and probe-secrets-in-history both hold a
  // NEGATIVE_CHECK list and walk every pattern over it, collecting false
  // firings -- a real negative control that no `if (cond) fail` shape can see.
  if (/NEGATIVE_CHECK|C_NEG\b|const negative\b|\bnegative\s*=/.test(region)) {
    const m = region.match(/(NEGATIVE_CHECK|C_NEG\w*|negative)/)
    return { present: true, evidence: `named clean-sample table: ${m[1]}` }
  }
  // The fixture-table spelling: a row whose expected finding count is zero.
  const table = region.match(
    /,\s*0\s*,\s*0\s*\]|toEqual\(\s*\[\s*\]\s*\)|expect:\s*\[\s*\]|credits:\s*0|unresolved:\s*0/
  )
  if (table) return { present: true, evidence: table[0].trim() }
  return { present: false, evidence: '' }
}

/** Files that accuse code of something and carry a self-check. */
function detectors(c, counter) {
  const out = []
  // scripts/lib holds detectors too -- credit-sites and credit-guards each
  // carry fixture tables of known-clean code. Walking only the top level
  // left them out of the population entirely, so the calibration below could
  // compare only nine of twenty-two files.
  const dirs = [path.join(ROOT, 'scripts'), path.join(ROOT, 'scripts', 'lib')]
  const entries = []
  for (const d of dirs) {
    if (!fs.existsSync(d)) continue
    for (const n of fs.readdirSync(d)) entries.push([d, n])
  }
  for (const [dir, name] of entries) {
    if (!name.endsWith('.cjs')) continue
    const file = path.join(dir, name)
    if (counter) counter.tried++
    const raw = c.read1(file)
    if (raw === null) continue
    if (!SELF_CHECK_MARKER.test(raw)) continue
    out.push({ file: path.relative(ROOT, file), raw })
  }
  return out
}

function selfCheckMe() {
  // Positive: a region that DOES assert a non-detection must be recognised.
  const good = `function selfCheck() {
    const commented = matchCode("// import x", RE)
    if (commented.length !== 0) fail('comment counted as live')
  }`
  if (!hasNegativeControl(selfCheckRegion(good)).present) {
    console.error(
      'self-check FAILED: a real negative control was not recognised'
    )
    process.exit(2)
  }
  // The shape the first version missed entirely, taken verbatim from
  // probe-refund-without-charge: a truthiness test on a match count, with no
  // comparison to zero anywhere in it.
  const truthy = `function selfCheck() {
    if (hit("case 'MONEY_INCOME':", CREDIT))
      fail('string literal counted as a credit')
  }`
  if (!hasNegativeControl(selfCheckRegion(truthy)).present) {
    console.error(
      'self-check FAILED: `if (hit(clean)) fail(...)` is a negative control and was not recognised'
    )
    process.exit(2)
  }
  // And its positive twin, one character apart, must NOT count.
  const truthyPositive = `function selfCheck() {
    if (!hit('await updateUserBalance(x)', CREDIT)) fail('credit not recognised')
  }`
  if (hasNegativeControl(selfCheckRegion(truthyPositive)).present) {
    console.error(
      'self-check FAILED: `if (!hit(dirty)) fail(...)` is a POSITIVE control and was counted as negative'
    )
    process.exit(2)
  }
  // Negative: two POSITIVE samples are one control twice, not two controls.
  // This is the mistake the whole file is about, so it is the control that
  // matters most here.
  const twoPositives = `function selfCheck() {
    if (find(sampleA).length === 0) fail('sample A not found')
    if (find(sampleB).length === 0) fail('sample B not found')
  }`
  if (hasNegativeControl(selfCheckRegion(twoPositives)).present) {
    console.error(
      'self-check FAILED: two positive samples were counted as a negative control'
    )
    process.exit(2)
  }
  // Negative: a population/liveness assertion is not a negative control.
  const liveness = `function selfCheck() {
    if (files.length === 0) fail('read nothing at all')
  }`
  if (hasNegativeControl(selfCheckRegion(liveness)).present) {
    console.error('self-check FAILED: a liveness check counted as a control')
    process.exit(2)
  }
  // And a file with no self-check region at all must not be judged as having
  // a control -- absence of a region is not absence of a defect.
  if (hasNegativeControl(selfCheckRegion('const a = 1')).present) {
    console.error('self-check FAILED: a file without a self-check claimed one')
    process.exit(2)
  }
  console.log(
    'self-check OK: a non-detection assertion is recognised; two positives, a liveness check and an absent region are not'
  )
}

/**
 * Compare this tool's verdicts against a hand-read census of the same files.
 *
 * The point of the whole exercise: a detector that has not been measured
 * against known-correct input has not earned its findings. Both directions are
 * printed, because they are different failures -- a false accusation sends
 * somebody to fix code that is fine, a miss leaves a gap while reporting
 * health.
 */
function calibrate(censusPath) {
  const truth = calib.load(censusPath)
  const c = census('negative-controls')
  const mine = new Map()
  for (const d of detectors(c, null)) {
    mine.set(d.file, hasNegativeControl(selfCheckRegion(d.raw)).present)
  }
  calib.report(calib.compare(truth, mine), 'negative controls')
}

function main() {
  const argv = process.argv.slice(2)
  if (argv.includes('--self-check')) return selfCheckMe()
  const ci = argv.indexOf('--calibrate')
  if (ci !== -1) return calibrate(argv[ci + 1])

  const c = census('negative-controls')
  // Counted against files ATTEMPTED, not against the filtered detectors: the
  // census reads every .cjs to decide, and reporting it against the smaller
  // list printed "read 87 of 45" and invented forty-two unread files.
  const counter = { tried: 0 }
  const list = detectors(c, counter)
  const withNeg = []
  const without = []
  for (const d of list) {
    const verdict = hasNegativeControl(selfCheckRegion(d.raw))
    ;(verdict.present ? withNeg : without).push({ ...d, verdict })
  }
  c.report(counter.tried)
  console.log(`\nдетекторов с самопроверкой: ${list.length}`)
  console.log(`  с отрицательным контролем: ${withNeg.length}`)
  console.log(`  БЕЗ него:                  ${without.length}`)
  if (list.length === 0) {
    console.log('НОЛЬ детекторов — это не чистота, а сломанный обход')
    process.exit(2)
  }
  for (const d of without) console.log(`  без контроля: ${d.file}`)
}

main()
