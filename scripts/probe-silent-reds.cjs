#!/usr/bin/env node
/**
 * WHICH FAILING TESTS THE GATE CANNOT REPORT.
 *
 * The gate compares SETS OF PASSING NAMES against a snapshot. That makes a
 * failing test invisible in one specific case: if it was already failing when
 * the snapshot was taken, its name is not in the snapshot, so its red is an
 * ABSENCE the gate has nothing to compare against. It is silence, not a report.
 *
 * The gate is right to work this way -- it exists to catch regressions, and a
 * test that never passed never regressed. But the consequence is that a guard
 * can be broken from the day it is written and stay broken indefinitely, which
 * is what happened to two money ratchets found in iteration 152: one blinded by
 * a comment that captured its indexOf anchor, one whose mutation removed one of
 * two disarms and expected zero. Both had never passed. Nothing said so.
 *
 * So this asks the question the gate structurally cannot:
 *
 *   failing        = assertions whose status is FAILED (not "did not pass")
 *   SILENT RED     = failing AND absent from the snapshot  <- the blind spot
 *   loud red       = failing AND present in the snapshot   <- the gate reports this
 *
 * A silent red is not automatically a bug in the product. It is a guard whose
 * verdict nobody is reading, which is strictly worse than not having it: it
 * occupies the space where a working guard would go.
 *
 * SKIPPED IS ITS OWN ANSWER and is counted separately. The first version of this
 * probe defined failing as ran-minus-passing and announced 300 red tests; 299 of
 * them were skipped. The size was the clue -- 299 independently broken guards is
 * not a thing that happens, one conflated status is. Measured on this tree, the
 * whole repository holds ZERO failing assertions and 299 skipped ones, and the
 * single genuine silent red it did find was a security guard that had never
 * passed (noEmbeddedDbCredentials, fixed in the same change).
 */
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const { passingSet, ranSet } = require('./test-gate.cjs')

const REPO = path.join(__dirname, '..')
const BASELINE = path.join(REPO, '.test-baseline.txt')
const TMP = '/tmp/silent-reds-report.json'

function runVitest(targets) {
  const args = [
    'vitest',
    'run',
    '--reporter=json',
    `--outputFile=${TMP}`,
    ...targets,
  ]
  try {
    execFileSync('npx', args, {
      cwd: REPO,
      stdio: 'pipe',
      maxBuffer: 128 * 1024 * 1024,
    })
  } catch {
    // A non-zero exit is expected here: finding red tests is the point.
  }
  if (!fs.existsSync(TMP))
    throw new Error('vitest wrote no report -- the run did not happen')
  return JSON.parse(fs.readFileSync(TMP, 'utf8'))
}

/**
 * Every assertion name by status. NOT ran-minus-passing: a vitest run has more
 * than two outcomes, and the difference of those two sets means "did not pass",
 * which lumps SKIPPED tests in with failed ones.
 *
 * The first version of this probe made exactly that mistake and reported 300
 * red tests. 217 of them were skipped -- twelve Inngest files that skip
 * themselves wholesale. A number that large is itself a symptom: 217 separate
 * defects is not a thing that happens, one miscounted status is.
 */
function statusSets(report) {
  const failed = new Set()
  const skipped = new Set()
  for (const file of report.testResults || []) {
    const rel = path.relative(REPO, file.name)
    for (const a of file.assertionResults || []) {
      const id = `${rel} :: ${a.fullName || a.title}`
      if (a.status === 'failed') failed.add(id)
      else if (a.status !== 'passed') skipped.add(id)
    }
  }
  return { failed, skipped }
}

/**
 * The classification, separated from the run so it can be exercised without
 * one. A control that needs a full suite run is a control nobody runs.
 */
function classify(failed, baseline) {
  const all = [...failed]
  return {
    failing: all,
    silent: all.filter(n => !baseline.has(n)).sort(),
    loud: all.filter(n => baseline.has(n)).sort(),
  }
}

function selfCheck() {
  const eq = (got, want, why) => {
    if (JSON.stringify(got) !== JSON.stringify(want))
      throw new Error(`selfCheck ${why}: ${JSON.stringify(got)}`)
  }
  const baseline = new Set(['f :: a', 'f :: b'])
  const r = classify(new Set(['f :: b', 'f :: c']), baseline)
  // b failed and the snapshot knows it -> the gate reports that one.
  eq(r.loud, ['f :: b'], 'loud red misclassified')
  // c failed and the snapshot never knew it -> the gate cannot report it.
  eq(r.silent, ['f :: c'], 'silent red misclassified')
  // A green run must produce neither, or every clean tree looks alarming.
  eq(classify(new Set(), baseline).failing, [], 'a clean run must be empty')

  // A SKIPPED test is not a failing one. This is the sample that would have
  // caught the first version of this probe, which reported 217 skipped Inngest
  // assertions as red.
  const report = {
    testResults: [
      {
        name: path.join(REPO, 'f.test.ts'),
        assertionResults: [
          { fullName: 'p', status: 'passed' },
          { fullName: 'f', status: 'failed' },
          { fullName: 's', status: 'skipped' },
          { fullName: 't', status: 'todo' },
        ],
      },
    ],
  }
  const { failed, skipped } = statusSets(report)
  eq([...failed], ['f.test.ts :: f'], 'only a failed test is failed')
  eq(
    [...skipped].sort(),
    ['f.test.ts :: s', 'f.test.ts :: t'],
    'skipped and todo belong together, and apart from failed'
  )
  return true
}

function main() {
  selfCheck()
  console.log('самопроверка: громкий и тихий разделены, чистый прогон пуст')

  const baseline = new Set(
    fs
      .readFileSync(BASELINE, 'utf8')
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean)
  )

  const targets = process.argv.slice(2)
  console.log(
    `прогон: ${targets.length ? targets.join(' ') : 'весь репозиторий'} (долго)`
  )
  const report = runVitest(targets)
  const ran = ranSet(report)
  const passing = passingSet(report)
  const { failed, skipped } = statusSets(report)
  const { failing, silent, loud } = classify(failed, baseline)

  console.log(
    `\nпрогнано утверждений: ${ran.size}, прошло: ${passing.size}` +
      `, ПРОПУЩЕНО: ${skipped.size}, красных: ${failing.length}`
  )
  console.log(`  громких (гейт доложит): ${loud.length}`)
  console.log(`  ТИХИХ  (гейт не может): ${silent.length}\n`)

  const byFile = new Map()
  for (const n of silent) {
    const f = n.split(' :: ')[0]
    if (!byFile.has(f)) byFile.set(f, [])
    byFile.get(f).push(n.split(' :: ').slice(1).join(' :: '))
  }
  for (const [f, names] of [...byFile].sort()) {
    console.log(`  ${f}  (${names.length})`)
    for (const n of names) console.log(`      ${n}`)
  }
  for (const n of loud) console.log(`  ГРОМКИЙ  ${n}`)

  if (!silent.length && !loud.length)
    console.log('  ни одного красного теста в этом прогоне')

  if (skipped.size) {
    // Skipped is not red, but it is not covered either. Printed by file so the
    // silence has a size and a name: a guard nobody runs protects nobody.
    const byDir = new Map()
    for (const n of skipped) {
      const d = path.dirname(n.split(' :: ')[0])
      byDir.set(d, (byDir.get(d) || 0) + 1)
    }
    console.log(`\nПРОПУЩЕНО ${skipped.size} утверждений, по каталогам:`)
    for (const [d, n] of [...byDir].sort((a, b) => b[1] - a[1]))
      console.log(`  ${String(n).padStart(4)}  ${d}`)
  }

  console.log(
    '\nтихий красный -- не обязательно дефект продукта. Это сторож, чей вердикт' +
      '\nникто не читает, и он занимает место, где стоял бы работающий.'
  )
  // Exit 0 either way: this is a measurement, not a gate. Making it a gate
  // would only add a second thing to disable when it is inconvenient.
}

if (require.main === module) main()
module.exports = { classify, statusSets, selfCheck }
