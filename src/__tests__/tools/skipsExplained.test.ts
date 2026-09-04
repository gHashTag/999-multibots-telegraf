import { describe, it, expect } from 'vitest'

/**
 * Ratchet: an UNCONDITIONALLY skipped test must say why it is switched off.
 *
 * A skipped test is not a failing one, but it is not coverage either -- it is a
 * guard standing in the place where a working guard would go. The gate cannot
 * help here for the same reason it could not report a never-passing test: a
 * skipped name is simply absent from the passing set, so switching a suite off
 * is invisible to every check the repository has.
 *
 * The two kinds are different questions and only one owes an explanation:
 *
 *   .skipIf(cond)  conditional -- the condition IS the reason (no credentials,
 *                  wrong platform). Counted, never judged.
 *   .skip(...)     unconditional -- a person turned this off, and it stays off
 *                  until a person turns it back on.
 *
 * Measured when this was written: 46 conditional, 42 unconditional, and ALL 42
 * carry a reason. This does not fix anything; it holds a property that is
 * currently true, so the forty-third skip cannot arrive bare. The release audit
 * of 2026-08-28 ("208 failing tests -> 0") is what made it true, and the best of
 * those notes name the exact mismatch and the decision that would revive the
 * test: "render.ts exports renderFunction, the test imports render ... remove
 * the skip when you decide which functions should exist."
 *
 * The reason is looked for in the span between the END OF THE PREVIOUS
 * STATEMENT and the skip -- whatever the author wrote directly above this test
 * and nothing else. Not a line window: there is no N to tune and no way to
 * borrow a comment belonging to a neighbour (203, 207).
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const probe = require('../../../scripts/probe-skips.cjs')

describe('a switched-off test says why', () => {
  it('the detector agrees with its own samples', () => {
    // Includes the sample that caught this check's own defect: the reason
    // length used \W, which is ASCII-only in JavaScript, so a Cyrillic
    // explanation measured as EMPTY and a fully documented skip was reported
    // bare. In a repository whose comments are largely Russian that is not an
    // edge case, it is most of the population.
    expect(() => probe.selfCheck()).not.toThrow()
    expect(probe.SAMPLES.length).toBeGreaterThanOrEqual(7)
  })

  it('every unconditional skip carries a reason', () => {
    const { rows } = probe.census()
    const bare = rows.flatMap((r: { file: string; skips: any[] }) =>
      r.skips.filter(s => !s.explained).map(s => `${r.file}:${s.line}`)
    )
    expect(
      bare,
      `An unconditionally skipped test with no stated reason is indistinguishable ` +
        `from an abandoned one: the next reader cannot tell whether to revive it ` +
        `or delete it. Write what is broken and what decision would turn it back on.`
    ).toEqual([])
  })

  it('floor: the census still finds the skips, so it is not measuring nothing', () => {
    // Without this, a detector that matched nothing would report a perfectly
    // documented repository -- the failure this whole family of ratchets keeps
    // rediscovering.
    const { rows, conditional } = probe.census()
    const total = rows.reduce(
      (n: number, r: { skips: unknown[] }) => n + r.skips.length,
      0
    )
    expect(total, 'unconditional skips').toBeGreaterThanOrEqual(20)
    expect(conditional, 'conditional skips').toBeGreaterThanOrEqual(20)
  })
})
