'use strict'

/**
 * COMPARE A DETECTOR'S VERDICTS AGAINST A HAND-READ CENSUS.
 *
 * Every counting gate measures two things at once and reports one number: the
 * state of the repository, and the accuracy of the matcher that looked at it.
 * When the number moves, nothing in the number says which one moved.
 *
 * That is not theoretical. The detector this was extracted from opened by
 * calling 38 probes unguarded; the truth was 8. Each of the five rewrites in
 * between made the count fall, and not one of those falls was a repair to the
 * repository. Published on its first run, every one of those thirty would have
 * been someone else's defect.
 *
 * So a detector earns its findings by being measured against a reading. This
 * file holds the comparison, so the second gate to want it does not write a
 * third version of it.
 *
 * TWO ERROR DIRECTIONS, ALWAYS PRINTED SEPARATELY. They are different
 * failures and a single "accuracy" figure lets one be traded for the other:
 *
 *   FALSE ALARM  said yes, the reading says no -- hides nothing, invents work,
 *                and sends somebody to fix a subject that is fine
 *   MISS         said no, the reading says yes -- hides debt behind a green
 *                number, which is how a ratchet stops ratcheting
 *
 * The census is not infallible either, and pretending otherwise is how a wrong
 * reading becomes permanent. Of eight disagreements on the first use, a third
 * pass found the tool right four times and the reading right four. Ground
 * truth is what was argued over, not what was written down -- so disagreements
 * are printed by name, for a human to settle, never silently resolved in
 * either direction.
 */

const fs = require('fs')

/**
 * @param {Record<string, boolean>} truth   subject -> what a reading found
 * @param {Map<string, boolean>|Record<string, boolean>} verdicts  what the tool says
 * @returns {{compared:number, agree:number, falseAlarm:string[], missed:string[], uncomparable:string[]}}
 */
function compare(truth, verdicts) {
  const said =
    verdicts instanceof Map ? verdicts : new Map(Object.entries(verdicts))
  let agree = 0
  const falseAlarm = []
  const missed = []
  const uncomparable = []
  for (const [subject, expected] of Object.entries(truth)) {
    if (!said.has(subject)) {
      // Counted, never dropped. A census entry the tool never saw means the
      // two populations have drifted apart, and a calibration that quietly
      // skipped those would report a high score over a shrinking overlap.
      uncomparable.push(subject)
      continue
    }
    const verdict = said.get(subject)
    if (verdict === expected) agree++
    else if (verdict) falseAlarm.push(subject)
    else missed.push(subject)
  }
  return {
    compared: agree + falseAlarm.length + missed.length,
    agree,
    falseAlarm,
    missed,
    uncomparable,
  }
}

/**
 * Print the result and REFUSE when nothing was comparable.
 *
 * Exits 2 rather than returning a value: a caller that ignored the return
 * would print its clean verdict anyway, and "0 disagreements" over an empty
 * overlap is the most convincing wrong answer this whole file exists to stop.
 */
function report(result, label) {
  const l = label ? ` (${label})` : ''
  console.log(`\nсверено с ручной переписью: ${result.compared}${l}`)
  console.log(`  совпало:            ${result.agree}`)
  console.log(
    `  ЛОЖНАЯ ТРЕВОГА:     ${result.falseAlarm.length}  (сказал «есть», на деле нет)`
  )
  console.log(
    `  ПРОПУСК:            ${result.missed.length}  (сказал «нет», на деле есть)`
  )
  if (result.uncomparable.length) {
    console.log(
      `  НЕ СВЕРЕНО:         ${result.uncomparable.length}  (есть в переписи, нет в популяции инструмента)`
    )
    for (const s of result.uncomparable.slice(0, 10)) console.log(`    ${s}`)
  }
  for (const s of result.falseAlarm) console.log(`    ложно: ${s}`)
  for (const s of result.missed) console.log(`    пропущено: ${s}`)
  if (result.compared === 0) {
    console.log('НИ ОДИН предмет не сверен — калибровка ничего не измерила')
    process.exit(2)
  }
}

/** Read a census file, refusing an empty one for the same reason. */
function load(censusPath) {
  const truth = JSON.parse(fs.readFileSync(censusPath, 'utf8'))
  if (!truth || Object.keys(truth).length === 0) {
    console.error(`перепись ${censusPath} пуста — сверять не с чем`)
    process.exit(2)
  }
  return truth
}

/**
 * Both directions must be reachable, or the comparison agrees by construction.
 * The uncomparable case is a control too: it was added after a run reported
 * "9 of 22" and the thirteen missing were only noticed by hand.
 */
function selfCheck(label) {
  const fail = why => {
    console.error(`самопроверка калибровки не прошла: ${why}`)
    process.exit(2)
  }
  const truth = { a: true, b: false, c: true, d: false, gone: true }
  const said = new Map([
    ['a', true], // agrees
    ['b', false], // agrees
    ['c', false], // MISS
    ['d', true], // FALSE ALARM
  ])
  const r = compare(truth, said)
  if (r.agree !== 2) fail(`совпадений ${r.agree}, а не 2`)
  if (r.missed.join() !== 'c') fail(`пропуск ${r.missed.join()}, а не c`)
  if (r.falseAlarm.join() !== 'd') fail(`ложная ${r.falseAlarm.join()}, а не d`)
  if (r.uncomparable.join() !== 'gone') fail('несверенный предмет потерян')
  if (r.compared !== 4) fail(`сверено ${r.compared}, а не 4`)
  // Negative control: perfect agreement must produce empty error lists, or
  // the two directions above could be reporting noise.
  const perfect = compare(
    { x: true, y: false },
    new Map([
      ['x', true],
      ['y', false],
    ])
  )
  if (perfect.falseAlarm.length || perfect.missed.length) {
    fail('на полном согласии показаны ошибки')
  }
  if (label) console.log(`самопроверка калибровки: ${label}`)
}

module.exports = { compare, report, load, selfCheck }
