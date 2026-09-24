import { describe, expect, it } from 'vitest'
import { importerOf, orphans } from '../../../scripts/orphan-modules.cjs'

/*
 * A MODULE NOTHING IMPORTS IS A FEATURE NOBODY SWITCHED ON.
 *
 * Measured on my own work, 2026-09-25: two modules shipped with passing tests
 * and no caller at all. A green suite on a dead module looks exactly like a
 * green suite on a live one, so "done" was reported in good faith and was
 * wrong.
 *
 * The tests below are mostly about the MATCHER, because this check produced two
 * false alarms before it produced a true one, and a guard that cries about
 * healthy code teaches its reader to ignore it.
 */
describe('what counts as a caller', () => {
  const uses = (line: string, base = 'groupDayPlan') =>
    importerOf(base).test(line)

  it('a static import counts', () => {
    expect(uses("import { dayPlan } from '@/services/groupDayPlan'")).toBe(true)
    expect(uses("import x from './groupDayPlan'")).toBe(true)
  })

  it('a DYNAMIC import counts -- the false alarm that started this', () => {
    /*
     * This repository loads half its services with `await import(...)` on
     * purpose: a static import would drag the whole graph into a cold start.
     * A matcher blind to it called fifteen live modules dead, two of them
     * wired an hour earlier by the same author.
     */
    expect(uses("await import('@/services/groupDayPlan')")).toBe(true)
    expect(uses("const m = await import('./groupDayPlan')")).toBe(true)
  })

  it('require counts, for the scripts', () => {
    expect(uses("require('../services/groupDayPlan')")).toBe(true)
  })

  it('a MENTION does not count', () => {
    // The first version matched the bare name anywhere and slandered seven
    // modules, including two imported by render-server.ts.
    expect(uses('// see groupDayPlan for the silence rule')).toBe(false)
    expect(uses('const groupDayPlan = 1')).toBe(false)
  })

  it('a longer name that merely ends the same is not this module', () => {
    expect(uses("from '@/services/myGroupDayPlanExtra'")).toBe(false)
  })
})

describe('the census itself', () => {
  it('looks at a real number of modules, so an empty answer is not agreement', () => {
    const { looked, orphans: dead } = orphans()
    expect(looked).toBeGreaterThan(100)
    expect(Array.isArray(dead)).toBe(true)
  })

  it('does not list a module this very repository imports dynamically', () => {
    const { orphans: dead } = orphans()
    // Wired today through `await import('@/services/clubOnboarding')`.
    expect(dead).not.toContain('src/services/clubOnboarding.ts')
    // And through `await import('@/services/browserApproval')`.
    expect(dead).not.toContain('src/services/browserApproval.ts')
  })
})
