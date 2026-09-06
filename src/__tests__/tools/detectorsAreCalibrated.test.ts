import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Every detector that ships a census is measured against it, and may not get
 * less accurate.
 *
 * A counting gate reports one number for two things: the state of the
 * repository, and the accuracy of the matcher that looked at it. When the
 * number improves, nothing in the number says which one improved -- and
 * loosening the matcher is by far the cheaper way to improve it.
 *
 * That is not a worry, it is what happened. The first detector here opened by
 * calling 38 probes unguarded when the truth was 8, and each of five rewrites
 * made the count fall without a single repair to the repository. A ceiling on
 * its own would have recorded all five as progress.
 *
 * So each detector keeps a file of hand-read verdicts, and this holds the
 * agreement between the two. Adding the next detector is one row.
 *
 * The census is not infallible either. Of eight disagreements on the first
 * pass, a third reading found the tool right four times and the census right
 * four -- so disagreements are printed by name for a human, never resolved
 * silently in either direction.
 */

const REPO = path.resolve(__dirname, '..', '..', '..')

interface Calibrated {
  script: string
  census: string
  /** Measured, and the measurement is the whole point of the row. */
  minAgreement: number
  /** How many subjects the census and the tool actually share. */
  minCompared: number
}

const REGISTRY: Calibrated[] = [
  {
    script: 'scripts/negative-controls.cjs',
    census: 'docs/negative-control-census.json',
    minAgreement: 27,
    minCompared: 29,
  },
  {
    script: 'scripts/gate-liveness.cjs',
    census: 'docs/gate-liveness-census.json',
    // 30 of 30, both error directions empty. It did not start there: the
    // first version missed `toEqual(<non-empty>)`, which is how
    // moneyWriteVocabulary asserts its walk found ten writers, and called a
    // protected gate unprotected.
    minAgreement: 30,
    minCompared: 30,
  },
]

function calibrate(entry: Calibrated) {
  const out = execFileSync(
    'node',
    [entry.script, '--calibrate', entry.census],
    { cwd: REPO, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }
  )
  const num = (label: string) =>
    Number(out.match(new RegExp(label + ':\\s*(\\d+)'))?.[1] ?? '-1')
  return {
    compared: num('сверено с ручной переписью'),
    agree: num('совпало'),
    falseAlarm: num('ЛОЖНАЯ ТРЕВОГА'),
    missed: num('ПРОПУСК'),
    raw: out,
  }
}

describe('detectors are measured against a reading, not trusted', () => {
  it.each(REGISTRY)('$script has a census to be judged against', entry => {
    // Without the file the calibration is vacuous, and the detector would be
    // trusted precisely because nothing checks it.
    const p = path.join(REPO, entry.census)
    expect(fs.existsSync(p), `${entry.census} is missing`).toBe(true)
    const rows = JSON.parse(fs.readFileSync(p, 'utf8'))
    expect(
      Object.keys(rows).length,
      'the census is empty -- there is nothing to be judged against'
    ).toBeGreaterThan(0)
  })

  it.each(REGISTRY)(
    '$script still compares against most of its census',
    entry => {
      // A calibration can collapse without failing: rename the subjects and the
      // overlap shrinks to nothing while the agreement rate stays perfect over
      // the two that are left.
      const { compared } = calibrate(entry)
      expect(
        compared,
        `only ${compared} subjects are comparable, expected at least ` +
          `${entry.minCompared}. The census and the tool are drifting apart`
      ).toBeGreaterThanOrEqual(entry.minCompared)
    }
  )

  it.each(REGISTRY)('$script does not get less accurate', entry => {
    // The ratchet that matters. Loosening the matcher makes the debt look
    // smaller and shows up here, where a raw count would show only a nicer
    // number.
    const { agree, compared } = calibrate(entry)
    expect(
      agree,
      `${entry.script} now agrees with its census on ${agree} of ${compared}, ` +
        `below the recorded ${entry.minAgreement}. Whatever moved the count ` +
        'made the tool worse, not the repository better'
    ).toBeGreaterThanOrEqual(entry.minAgreement)
  })

  it.each(REGISTRY)('$script reports both error directions', entry => {
    // A false alarm invents work; a miss hides debt behind a green number.
    // A single accuracy figure lets one be traded for the other.
    const { falseAlarm, missed, agree, compared } = calibrate(entry)
    expect(
      falseAlarm + missed,
      'the two directions do not account for the disagreement'
    ).toBe(compared - agree)
  })

  it.each(REGISTRY)('$script passes its own self-check', entry => {
    // Calibration alone does not catch a LOOSENED matcher once the census is
    // uniform. It was verified by mutation: making every gate count as
    // protected left all twelve assertions green, because the census now says
    // all thirty are protected and a tool that says yes to everything agrees
    // with it perfectly.
    //
    // The detector's own self-check is what closes that, because it holds a
    // NEGATIVE control -- a gate with no floor that must not be called
    // protected. It was simply never being run from here. With this row, the
    // same mutation exits 2 and execFileSync throws.
    expect(() =>
      execFileSync('node', [entry.script, '--self-check'], {
        cwd: REPO,
        encoding: 'utf8',
        maxBuffer: 4 * 1024 * 1024,
      })
    ).not.toThrow()
  })

  it('has a row for every census in the repository', () => {
    // An orphaned census is worse than none: it looks like the detector is
    // measured, and nothing runs the comparison.
    const docs = path.join(REPO, 'docs')
    const censuses = fs
      .readdirSync(docs)
      .filter(f => f.endsWith('-census.json'))
      .map(f => `docs/${f}`)
    expect(censuses.length, 'no census files found at all').toBeGreaterThan(0)
    const registered = new Set(REGISTRY.map(r => r.census))
    expect(
      censuses.filter(c => !registered.has(c)),
      'a census exists that nothing calibrates against'
    ).toEqual([])
  })
})
