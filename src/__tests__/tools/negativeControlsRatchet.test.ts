import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Two things are held here, and the second is the point.
 *
 * `tri probes` already holds the other half of the question: every source
 * probe must have a POSITIVE control, a sample that must be found. That guards
 * against a broken matcher reporting a clean sheet.
 *
 * This holds the half that hurt. Writing the comment-arithmetic checker took
 * one pass to detect and five to stop it accusing correct code, and every one
 * of those five false alarms looked like a finding on its first run.
 *
 *   1. the count of detectors with no negative control may not grow
 *   2. THE DETECTOR THAT MEASURES THAT MAY NOT GET LESS ACCURATE
 *
 * The second exists because the first cannot be trusted on its own. The
 * mechanical detector was compared against a file-by-file reading of 30 of the
 * same detectors, and its first version agreed on 17 of 29. Publishing that raw
 * count as fact would
 * have been the exact sin the tool exists to prevent, so the census is checked
 * in and the tool is pinned to it: a change that makes the matcher looser or
 * tighter shows up as a drop in agreement, not as a quieter number.
 *
 * The census covers 30 of the 59 detectors. That is a real limit and it is
 * stated rather than hidden: the ceiling below is mechanical and approximate,
 * the agreement figure is exact over the part that was read.
 */

const REPO = path.resolve(__dirname, '..', '..', '..')
const CENSUS = path.join(REPO, 'docs', 'negative-control-census.json')

/**
 * Measured 2026-09-05 over five rewrites. Each number is the count of
 * detectors with NO negative control, and every fall came from the matcher
 * making fewer false accusations -- not one of them from a repair to the
 * repository:
 *
 *   38  looked only for `!== 0`
 *   26  after `== 0` stopped matching inside `!== 0`
 *   20  after conditions were read with a paren counter, not a regex
 *   10  after template braces stopped truncating the failure branch
 *    8  after a 345-character "region" stopped hiding the table it contained
 *
 * A tool built to count false accusations opened by making thirty of them.
 */
const CEILING = 8

/**
 * Measured against the census: 27 of 29 comparable files, 2 false alarms and
 * ZERO misses. The two survivors both over-credit -- the tool says a control
 * exists where careful reading finds none -- so its error is in the direction
 * of hiding debt, never of accusing a probe that is fine.
 */
const MIN_AGREEMENT = 27

function toolCounts() {
  const out = execFileSync('node', ['scripts/negative-controls.cjs'], {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  })
  const num = (label: string) =>
    Number(out.match(new RegExp(label + ':\\s*(\\d+)'))?.[1] ?? '-1')
  return {
    total: num('детекторов с самопроверкой'),
    withControl: num('с отрицательным контролем'),
    without: num('БЕЗ него'),
  }
}

function calibration() {
  const out = execFileSync(
    'node',
    ['scripts/negative-controls.cjs', '--calibrate', CENSUS],
    { cwd: REPO, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }
  )
  const num = (label: string) =>
    Number(out.match(new RegExp(label + ':\\s*(\\d+)'))?.[1] ?? '-1')
  return {
    compared: num('сверено с ручной переписью'),
    agree: num('совпало'),
    falseAlarm: num('ЛОЖНАЯ ТРЕВОГА'),
    missed: num('ПРОПУСК'),
  }
}

describe('detectors are measured against samples they must not accuse', () => {
  it('reads a real population', () => {
    // Every assertion below is about a count, and zero satisfies a ceiling
    // trivially. The probe exits 2 on an empty walk so this would throw
    // rather than pass quietly, but the assumption is stated anyway.
    expect(toolCounts().total, 'no detectors found').toBeGreaterThan(30)
  })

  it('keeps the count without a negative control from growing', () => {
    const { without } = toolCounts()
    expect(
      without,
      `${without} detectors have no sample they are asserted NOT to flag, and ` +
        `the ceiling is ${CEILING}. A new detector must bring one: a fixture ` +
        'that is correct, run through the same matcher, asserted to produce ' +
        'no finding. Two positive samples are one control twice.'
    ).toBeLessThanOrEqual(CEILING)
  })

  it('agrees with itself on the split', () => {
    const { total, withControl, without } = toolCounts()
    expect(withControl + without, 'the split lost a detector').toBe(total)
  })

  it('has a census to be judged against', () => {
    // Without the file every calibration below is vacuous, and the tool would
    // be trusted precisely because nothing checks it.
    expect(fs.existsSync(CENSUS), 'the hand census is missing').toBe(true)
    const rows = JSON.parse(fs.readFileSync(CENSUS, 'utf8'))
    expect(
      Object.keys(rows).length,
      'the census shrank -- it is the only ground truth this tool has'
    ).toBeGreaterThanOrEqual(30)
    // The census is not infallible either: eight disagreements were read a
    // third time, and the first reading was wrong on four of them. It is
    // ground truth because it was argued over, not because it was written
    // down.
    expect(
      Object.values(rows).filter(Boolean).length,
      'the census no longer records which detectors are guarded'
    ).toBeGreaterThan(20)
  })

  it('does not get less accurate against that census', () => {
    // The ratchet that matters. A looser matcher makes the debt look smaller
    // and a tighter one accuses innocent probes; both show up here as fewer
    // agreements, where a raw count would show only a nicer number.
    const { compared, agree } = calibration()
    expect(
      compared,
      'nothing was comparable -- paths drifted'
    ).toBeGreaterThanOrEqual(29)
    expect(
      agree,
      `the detector now agrees with the hand census on ${agree} of ${compared} ` +
        `files, down from ${MIN_AGREEMENT}. Whatever made the count move made ` +
        'the tool worse, not the repository better'
    ).toBeGreaterThanOrEqual(MIN_AGREEMENT)
  })

  it('reports both error directions, not a single score', () => {
    // A false alarm and a miss are different failures: one hides debt, the
    // other sends someone to fix a probe that is fine. A tool that reported
    // only "accuracy" could trade one for the other silently.
    const { falseAlarm, missed } = calibration()
    expect(falseAlarm, 'false alarms not reported').toBeGreaterThanOrEqual(0)
    expect(missed, 'misses not reported').toBeGreaterThanOrEqual(0)
    expect(
      falseAlarm + missed,
      'the two error directions do not add up to the disagreement'
    ).toBe(calibration().compared - calibration().agree)
  })
})
