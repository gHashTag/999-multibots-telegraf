import { describe, it, expect } from 'vitest'
import path from 'node:path'

/**
 * The gate's suspects are baseline names missing from the PASSING set, and
 * that set answers two different questions with one silence:
 *
 *   a test that ran and FAILED     -> missing from passing
 *   a test that NEVER RAN at all   -> missing from passing
 *
 * A retry then turns both into "flaky". For the first that is a diagnosis; for
 * the second it is a misnomer, and it matters here because files failing to
 * enumerate is a known recurring condition on this machine -- the reason the
 * gate has a degraded-run banner and its own exit code at all.
 *
 * It cost a wrong sentence in a report: a run was described as "my test
 * flaked" when the honest statement was "the gate cannot tell whether it
 * failed or never ran". The vitest JSON carries a status per assertion, so the
 * distinction was always recoverable -- it was simply never asked for.
 *
 * These checks pin the two sets apart on synthetic reports, using the gate's
 * OWN functions rather than copies of them.
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  passingSet,
  ranSet,
  fileOf,
  classifySuspects,
  filesWithoutAssertions,
} = require('../../../scripts/test-gate.cjs')

const REPO = path.resolve(__dirname, '../../..')

/** A report shaped like vitest's JSON reporter output. */
const report = (
  file: string,
  assertions: Array<{ title: string; status: string }>
) => ({
  testResults: [
    {
      name: path.join(REPO, file),
      assertionResults: assertions.map(a => ({
        title: a.title,
        fullName: a.title,
        status: a.status,
      })),
    },
  ],
})

describe('the gate telling absence from failure', () => {
  it('counts only passing assertions as passing', () => {
    const r = report('src/x.test.ts', [
      { title: 'a', status: 'passed' },
      { title: 'b', status: 'failed' },
    ])
    const passing = passingSet(r)
    expect([...passing]).toEqual(['src/x.test.ts :: a'])
  })

  it('counts every assertion the run produced, whatever its status', () => {
    const r = report('src/x.test.ts', [
      { title: 'a', status: 'passed' },
      { title: 'b', status: 'failed' },
      { title: 'c', status: 'skipped' },
    ])
    const ran = ranSet(r)
    expect([...ran].sort()).toEqual([
      'src/x.test.ts :: a',
      'src/x.test.ts :: b',
      'src/x.test.ts :: c',
    ])
  })

  it('separates a failed test from one that never ran', () => {
    // The whole point. Both are absent from `passing`; only the failure is
    // present in `ran`. Without this, a file that stopped enumerating reads as
    // a flaky test and the environment problem stays invisible.
    const r = report('src/x.test.ts', [
      { title: 'ran-and-failed', status: 'failed' },
    ])
    const passing = passingSet(r)
    const ran = ranSet(r)

    const baseline = [
      'src/x.test.ts :: ran-and-failed',
      'src/x.test.ts :: never-ran',
    ]
    const suspects = baseline.filter(id => !passing.has(id))
    expect(suspects.length, 'both look identical to the passing set').toBe(2)

    const failed = suspects.filter(id => ran.has(id))
    const absent = suspects.filter(id => !ran.has(id))
    expect(failed).toEqual(['src/x.test.ts :: ran-and-failed'])
    expect(absent).toEqual(['src/x.test.ts :: never-ran'])
  })

  it('splits suspects into regression, flaky, and never-ran', () => {
    // The classification itself, which inside main() could only be exercised
    // by a real degradation event. All twenty-five worktrees on this machine
    // were healthy when this was written, so the event cannot be summoned --
    // hence a pure function rather than three lines nothing can reach.
    const suspects = ['f :: broke', 'f :: flaked', 'f :: never-ran']
    const ranFirst = new Set(['f :: broke', 'f :: flaked'])
    const recheckPassing = new Set(['f :: flaked', 'f :: never-ran'])

    const out = classifySuspects(suspects, ranFirst, recheckPassing)
    expect(out.confirmed).toEqual(['f :: broke'])
    expect(out.flakyRan).toEqual(['f :: flaked'])
    expect(out.flakyAbsent).toEqual(['f :: never-ran'])
  })

  it('calls nothing flaky when the retry passes nothing', () => {
    // Control: with an empty retry every suspect is a confirmed regression,
    // and neither flaky bucket may absorb one.
    const suspects = ['f :: a', 'f :: b']
    const out = classifySuspects(suspects, new Set(['f :: a']), new Set())
    expect(out.confirmed).toEqual(['f :: a', 'f :: b'])
    expect(out.flakyRan).toEqual([])
    expect(out.flakyAbsent).toEqual([])
  })

  it('puts every suspect in exactly one bucket', () => {
    // The three buckets are reported separately, so an id appearing twice
    // would be counted twice and one missing would vanish from the verdict.
    const suspects = ['f :: a', 'f :: b', 'f :: c', 'f :: d']
    const out = classifySuspects(
      suspects,
      new Set(['f :: a', 'f :: c']),
      new Set(['f :: c', 'f :: d'])
    )
    const all = [...out.confirmed, ...out.flakyRan, ...out.flakyAbsent]
    expect(all.sort()).toEqual(suspects.slice().sort())
    expect(new Set(all).size).toBe(suspects.length)
  })

  it('reads an empty report as nothing having run, not as everything passing', () => {
    // A run that produced no report at all is the shape that would otherwise
    // declare the whole baseline flaky.
    expect(passingSet({}).size).toBe(0)
    expect(ranSet({}).size).toBe(0)
    expect(passingSet({ testResults: [] }).size).toBe(0)
  })

  it('names a file that produced no assertion at all', () => {
    // The third answer, one level up. Both sets above reason about assertions,
    // so a file whose import throws is absent from BOTH -- it contributes
    // neither a pass nor a failure, and the suspect list cannot name it
    // either, because suspects come from the baseline and a file that never
    // ran never entered the baseline.
    const r = {
      testResults: [
        {
          name: path.join(REPO, 'src/ok.test.ts'),
          assertionResults: [
            { title: 'a', fullName: 'a', status: 'passed' as const },
          ],
        },
        {
          name: path.join(REPO, 'src/broken.test.ts'),
          status: 'failed',
          message: "Cannot find package 'undici'\n  at import",
          assertionResults: [],
        },
      ],
    }
    expect(passingSet(r).size, 'the healthy file still counts').toBe(1)
    expect(ranSet(r).size, 'the broken file adds nothing to either set').toBe(1)

    const silent = filesWithoutAssertions(r)
    expect(silent.map((s: { file: string }) => s.file)).toEqual([
      'src/broken.test.ts',
    ])
    expect(
      silent[0].reason,
      'the reason must travel with the name, or the report says only that something is wrong'
    ).toBe("Cannot find package 'undici'")
  })

  it('does not confuse an all-skipped file with one that never ran', () => {
    // Control, and the discriminator this rests on: a file whose tests are all
    // skipped still PRODUCES those assertions, so its list is non-empty. Only
    // a file that failed to load has none. Without this the check would report
    // 41 healthy skipped files as broken.
    const skipped = report('src/skipped.test.ts', [
      { title: 'a', status: 'skipped' },
      { title: 'b', status: 'skipped' },
    ])
    expect(passingSet(skipped).size, 'nothing passed here').toBe(0)
    expect(filesWithoutAssertions(skipped)).toEqual([])
  })

  it('reports nothing on a report with no files', () => {
    expect(filesWithoutAssertions({})).toEqual([])
    expect(filesWithoutAssertions({ testResults: [] })).toEqual([])
  })

  it('treats a missing assertion list the same as an empty one', () => {
    // Today vitest writes `assertionResults: []` for a file that failed to
    // load -- the key is present and empty, which is what the fixture above
    // reproduces. The fallback for a MISSING key is therefore unreachable
    // through the real reporter, and a mutation of it survived every other
    // check here. Specified rather than left unjudged: both shapes mean the
    // file produced nothing, so both must be named.
    const r = {
      testResults: [{ name: path.join(REPO, 'src/nokey.test.ts') }],
    }
    expect(
      filesWithoutAssertions(r).map((s: { file: string }) => s.file)
    ).toEqual(['src/nokey.test.ts'])
  })

  it('keeps the id spelling identical in both sets', () => {
    // The two sets are compared with each other, so a difference in how they
    // spell an id would silently classify every failure as absent.
    const r = report('src/x.test.ts', [{ title: 'a', status: 'passed' }])
    const [fromPassing] = [...passingSet(r)]
    const [fromRan] = [...ranSet(r)]
    expect(fromRan).toBe(fromPassing)
    expect(fileOf(fromPassing)).toBe('src/x.test.ts')
  })
})
