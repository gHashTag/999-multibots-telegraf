import { describe, it, expect } from 'vitest'

/*
 * slice(indexOf(x)) WITH A MISSING x RETURNS THE LAST CHARACTER OF THE FILE.
 *
 * indexOf gives -1, slice(-1) gives one character. A positive assertion then
 * fails with something unreadable -- `expected '\n' to contain '...'` -- which
 * is how the gate went red on a clean tree the day #2226 reformatted an SQL
 * statement. The production code was correct; only the anchor was gone.
 *
 * The other direction is the dangerous one, and it is why this is a helper and
 * not a one-line fix at one call site: a NEGATIVE assertion over that '\n'
 * passes vacuously and for ever. A guard that cannot see its subject reports no
 * violations, and nothing about it looks wrong.
 *
 * 32 call sites in this repository slice from an indexOf; 21 have no visible -1
 * check. They are not converted here -- that is a sweep, not a repair -- but the
 * tool they need now exists and one of them uses it.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  sliceFrom,
  sliceBetween,
} = require('../../../scripts/lib/anchored-slice.cjs')

const SRC = ['alpha', 'beta', 'gamma', 'delta'].join('\n')

describe('a missing anchor must fail loudly', () => {
  it('slices from the anchor to the end', () => {
    expect(sliceFrom(SRC, 'beta')).toBe('beta\ngamma\ndelta')
  })

  it('slices a bounded window', () => {
    expect(sliceFrom(SRC, 'beta', 4)).toBe('beta')
  })

  it('THROWS when the anchor is gone, and names it', () => {
    // The whole point. The old shape returned '\n' here.
    expect(() => sliceFrom(SRC, 'epsilon')).toThrowError(
      /anchor not found.*epsilon/
    )
  })

  it('the failure is not a vacuous pass: the old shape would go green here', () => {
    // Written as the contrast it is: a negative assertion over the last
    // character passes, which is what makes the silent version worse than a
    // noisy one.
    const oldShape = SRC.slice(SRC.indexOf('epsilon'))
    expect(oldShape).toBe('a')
    expect(oldShape).not.toContain('INSERT INTO star_payments') // vacuously true
    expect(() => sliceFrom(SRC, 'epsilon')).toThrow()
  })

  it('sliceBetween stops at the closing anchor', () => {
    expect(sliceBetween(SRC, 'beta', 'delta')).toBe('beta\ngamma\n')
    expect(() => sliceBetween(SRC, 'omega', 'delta')).toThrow(
      /anchor not found/
    )
  })

  it('a missing CLOSING anchor throws too -- the region must not grow silently', () => {
    /*
     * The same defect wearing the opposite face, and I shipped it hours ago
     * documented as a convenience.
     *
     * A region that cannot find its END does not shrink to nothing: it grows
     * from the opening anchor to the end of the file. Measured on the real
     * subject, a 517-character function became 5,990 characters and every
     * POSITIVE assertion over it still passed, because what they looked for was
     * somewhere in those 5,990 characters.
     *
     * So a vacuous pass is reachable through positive assertions too, and
     * "negative assertions are the dangerous ones" was too narrow a rule.
     */
    expect(() => sliceBetween(SRC, 'gamma', 'omega')).toThrowError(
      /closing anchor not found.*omega/
    )
    // the shape it replaces: silently the whole tail, and a positive assertion
    // over it is satisfied by anything that happens to be down there
    const grown = SRC.slice(SRC.indexOf('gamma'))
    expect(grown).toContain('delta')
  })
})
