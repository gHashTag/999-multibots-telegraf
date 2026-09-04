import { describe, it, expect } from 'vitest'

/**
 * This repository ratchets defect classes with written lists: a test finds
 * every site of a shape and compares it against the ones already known. There
 * are twenty-three such registries holding 229 entries, and until they were
 * named nothing pointed at them -- which cost an iteration, because a census
 * of discarded money results re-opened a question a debt list had already
 * closed.
 *
 * WITHDRAWN, one iteration later: this file used to also ratchet that every
 * registry carries a liveness note, and that rule does not hold.
 *
 * Measured rather than assumed. Of the twenty-three, only five list code sites
 * at all; the rest list table names, production bot usernames, quoted code
 * snippets and prose, and "does this run?" is meaningless for them -- a secret
 * in a file nobody imports is still leaked. The five that do list code already
 * explain themselves, just not with the words the matcher looked for: they
 * carry a per-entry `reason`. A second attempt, "every entry carries a
 * reason", fails the same way: a bare list of table names needs no reason per
 * row.
 *
 * Both were plausible-looking proxies for the thing that actually matters --
 * a header that says what the list means and what counts as fixing an entry --
 * and neither survives contact with the population. Keeping a rule that would
 * be satisfied by annotations written to please a ratchet is worse than
 * keeping no rule, so what remains here is the map and its self-checks.
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  census,
  REGISTRY_WORD,
  LIVENESS,
} = require('../../../scripts/probe-registries.cjs')

describe('the map of registries that hold this audit memory', () => {
  it('still finds them, so the map is not measuring an empty set', () => {
    // Control. The first version of the name matcher required a character
    // BEFORE the keyword, so a list literally called DEBT did not match and
    // the census reported two registries instead of twenty-three.
    const rows = census()
    expect(rows.length).toBeGreaterThanOrEqual(20)
    expect(
      rows.reduce((n: number, r: { entries: number }) => n + r.entries, 0)
    ).toBeGreaterThan(150)
  })

  it('recognises a registry name and refuses an ordinary constant', () => {
    for (const good of ['DEBT', 'KNOWN_DEBT', 'DEAD_DISCARD_ALLOWLIST'])
      expect(REGISTRY_WORD.test(good), good).toBe(true)
    for (const bad of ['ROOT', 'PATTERNS', 'CREDIT'])
      expect(REGISTRY_WORD.test(bad), bad).toBe(false)
  })

  it('recognises a liveness note and refuses an ordinary comment', () => {
    expect(LIVENESS.test('// verified DEAD, never mounted')).toBe(true)
    expect(LIVENESS.test('// the scene is never registered')).toBe(true)
    expect(LIVENESS.test('// sorted alphabetically for readability')).toBe(
      false
    )
  })
})
