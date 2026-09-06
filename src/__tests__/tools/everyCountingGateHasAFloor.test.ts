import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

/**
 * Every gate that scans and then bounds must also assert it found something.
 *
 * A counting gate reads the repository and bounds the result: a ceiling on a
 * debt, or an allowlist the findings may not exceed. All of them share one
 * failure. If the matcher stops matching -- a rename, a moved directory, a
 * switch rewritten as a map -- the scan returns nothing, the debt is zero, and
 * every bound is satisfied. The gate turns green at the moment it goes blind.
 *
 * A ceiling is satisfied by zero. `toEqual([])` is satisfied by an empty diff.
 * Only a FLOOR notices, and it has to be checked before the bound.
 *
 * A RULE, not a ceiling. Three money gates were missing a floor when this was
 * written and all three now have one, so the debt is zero and there is nothing
 * to grandfather. A ceiling of zero and a rule are the same assertion today;
 * the rule is the honest spelling of it, and it does not invite a number to
 * creep upward.
 *
 * The three that were missing:
 *   no-invented-price                   walked 718 sources, bounded with []
 *   sessionPaymentAmountNeverUnbacked   the same walk, the same bound
 *   batchRefundReconciliation           18 model blocks, 4 of them the subject
 *
 * The detector behind this is itself measured -- see
 * detectorsAreCalibrated.test.ts. It agrees with a file-by-file reading of all
 * thirty gates, which is why its count is quoted here as a fact rather than as
 * an estimate.
 */

const REPO = path.resolve(__dirname, '..', '..', '..')

function counts() {
  const out = execFileSync('node', ['scripts/gate-liveness.cjs'], {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  })
  const num = (label: string) =>
    Number(out.match(new RegExp(label + ':\\s*(\\d+)'))?.[1] ?? '-1')
  return {
    gates: num('счётных гейтов'),
    withFloor: num('с полом \\(переживут мёртвый матчер\\)'),
    without: num('БЕЗ пола'),
    raw: out,
  }
}

describe('a counting gate says whether it found anything', () => {
  it('finds the gates at all', () => {
    // The rule below is satisfied by an empty population, which is exactly the
    // shape it exists to forbid. The probe exits 2 on an empty walk so this
    // would throw rather than pass quietly; asserted anyway, because a rule
    // about liveness that is not itself live would be an odd thing to ship.
    const { gates } = counts()
    expect(
      gates,
      'no counting gates found -- the walk is broken'
    ).toBeGreaterThan(25)
  })

  it('has no gate that a dead matcher would pass', () => {
    const { without, raw } = counts()
    // Built from a string, not written as a regex literal: the repo's
    // no-cyrillic hook allows Cyrillic only inside string literals, and the
    // probe prints its findings in Russian. Blocked on three consecutive
    // iterations before this one; the rule is recorded and kept being
    // rediscovered at commit time rather than at writing time.
    const named = [...raw.matchAll(new RegExp('без пола: (\\S+)', 'g'))].map(
      m => m[1]
    )
    expect(
      named,
      'this gate scans the repository and bounds what it found, but never ' +
        'asserts the scan found anything. Add a floor before the bound: ' +
        'expect(scanned.length).toBeGreaterThan(N) with N measured, or ' +
        'compare the scan against a non-empty known set'
    ).toEqual([])
    expect(without, 'the count and the names disagree').toBe(0)
  })

  it('accounts for every gate in one of the two buckets', () => {
    // A filter that silently dropped a file would shrink the debt without
    // anyone adding a floor.
    const { gates, withFloor, without } = counts()
    expect(withFloor + without, 'the split lost a gate').toBe(gates)
  })
})
