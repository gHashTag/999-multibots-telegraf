import { describe, it, expect } from 'vitest'

/**
 * This repository ratchets defect classes with written lists: a test finds
 * every site of a shape and compares it against the ones already known. There
 * are twenty-three such registries holding two hundred and twenty-nine
 * entries, and until now nothing named them, so they were invisible unless you
 * happened to open the right test.
 *
 * That cost a whole iteration. A census of discarded money results turned up
 * three sites; only when the gate failed did the debt list appear, whose first
 * lines said the remaining entries were dead code and asked, in as many words,
 * not to re-inspect them each loop. Two claims nearly went into a report as
 * live money bugs.
 *
 * The liveness note is what makes a registry worth reading. "dead, verified
 * #1347" closes a question; a bare filename re-opens it every loop, because a
 * text-level census cannot see whether the code it found actually runs.
 *
 * Fifteen of the twenty-three carry no such note. Fixing that is reading work
 * for later loops, so what is pinned here is only that the number does not
 * GROW: a new registry has to say whether its entries are live.
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  census,
  REGISTRY_WORD,
  LIVENESS,
} = require('../../../scripts/probe-registries.cjs')

/** Measured 2026-09-05. Lower it when registries gain liveness notes. */
const BLIND_CEILING = 15

describe('the registries that hold this audit memory', () => {
  it('still finds them, so the ratchet is not measuring an empty set', () => {
    // Control. The first version of the name matcher required a character
    // BEFORE the keyword, so a list literally called DEBT did not match and
    // the census reported two registries instead of twenty-three.
    const rows = census()
    expect(rows.length).toBeGreaterThanOrEqual(20)
    expect(
      rows.reduce((n: number, r: { entries: number }) => n + r.entries, 0)
    ).toBeGreaterThan(150)
  })

  it('does not grow the number of registries with no liveness note', () => {
    const blind = census().filter((r: { liveness: boolean }) => !r.liveness)
    expect(
      blind.length,
      `registries with no liveness note:\n  ${blind
        .map((r: { name: string; file: string }) => `${r.name} — ${r.file}`)
        .join('\n  ')}`
    ).toBeLessThanOrEqual(BLIND_CEILING)
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
