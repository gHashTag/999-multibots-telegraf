import { describe, expect, it } from 'vitest'
import {
  importerOf,
  orphans,
  reachable,
} from '../../../scripts/orphan-modules.cjs'

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
  const files = () => orphans().orphans.map((d: { file: string }) => d.file)

  it('walks the program from its entries, not just the file list', () => {
    const { looked, live } = orphans()
    expect(looked).toBeGreaterThan(100)
    /*
     * The reachable set is the answer to the real question. If it collapses,
     * every module looks dead at once -- which is how a census turns into a
     * deletion list overnight.
     */
    expect(live).toBeGreaterThan(400)
  })

  it('does not list a module this very repository imports dynamically', () => {
    // Wired today through `await import('@/services/clubOnboarding')`.
    expect(files()).not.toContain('src/services/clubOnboarding.ts')
    // And through `await import('@/services/browserApproval')`.
    expect(files()).not.toContain('src/services/browserApproval.ts')
  })

  it('every named entry point EXISTS, or the census is about a smaller program', () => {
    /*
     * The mutation that exposed this: renaming the production entry to a file
     * that does not exist left the suite green, because the other two entries
     * still reach four hundred files. A threshold cannot notice a missing
     * door; only asking for the door can.
     */
    const { readFileSync } = require('node:fs')
    const { resolve } = require('node:path')
    const root = resolve(__dirname, '../../..')
    const src = readFileSync(
      resolve(root, 'scripts/orphan-modules.cjs'),
      'utf8'
    )
    const at = src.indexOf('const ENTRIES = [')
    expect(at, 'the census no longer names its entries').toBeGreaterThan(-1)
    const named = [
      ...src.slice(at, src.indexOf(']', at)).matchAll(/'([^']+)'/g),
    ].map(m => m[1])
    expect(named.length).toBeGreaterThan(1)
    for (const e of named)
      expect(() => readFileSync(resolve(root, e), 'utf8'), e).not.toThrow()
  })

  it('reaches the scenes and the background functions, or the entries are wrong', () => {
    /*
     * The sharpest way this census can lie is a missing entry point: half the
     * program then looks dead. Two families that must be reachable from the
     * production entry, or the answer is about the wrong program.
     */
    const live = reachable()
    expect(
      [...live].filter((f: string) => f.includes('/scenes/')).length
    ).toBeGreaterThan(20)
    expect([...live].some((f: string) => f.includes('inngest_app'))).toBe(true)
  })

  it('counts a COMMAND as a door, or every tool looks dead', () => {
    /*
     * The third correction to this census, and the same shape as the first
     * two: `margin-report.ts` was reported unreachable while `tri margin`
     * runs it every day through `render/scripts/margin.ts`. A CLI script is
     * an entry point exactly like a server is.
     *
     * Named files rather than a count: a threshold would have survived
     * losing the whole scripts family, which is what the earlier version of
     * this file learned the hard way.
     */
    const live = reachable()
    expect(
      live.has('apps/vibee-editor/render/src/agent/margin-report.ts')
    ).toBe(true)
    expect(live.has('apps/vibee-editor/render/scripts/margin.ts')).toBe(true)
  })

  it('names its own edges, because a narrow tool that hides them is blind', () => {
    /*
     * This repository has already paid for the other kind: a secrets sweep
     * saw fifty files fewer than it thought and said nothing, so every
     * conclusion drawn with it was worthless (no-silent-blindness.test.ts).
     *
     * The census looks at three directories, which is right -- the whole
     * tree answers with 239 names and nobody acts on that -- but it has to
     * SAY so beside the number.
     */
    const { readFileSync } = require('node:fs')
    const { resolve } = require('node:path')
    const src = readFileSync(
      resolve(__dirname, '../../..', 'scripts/orphan-modules.cjs'),
      'utf8'
    )
    expect(src).toContain('Охват:')
    expect(src).toContain("'--all'")
  })

  it('says when a module is imported ONLY by dead ones', () => {
    /*
     * The one-hop version answered the weaker question: two image generators
     * looked alive because a manager imports them, and nothing imports the
     * manager. A module reachable only through the dead is dead.
     */
    const { orphans: dead } = orphans()
    const flagged = dead.filter((d: { imported: boolean }) => d.imported)
    expect(flagged.length).toBeGreaterThan(0)
    expect(
      dead.every((d: { file: string }) => typeof d.file === 'string')
    ).toBe(true)
  })
})
