import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/*
 * `next()` IS `selectStep(cursor + 1)`, SO `selectStep(2); return next()` LANDS ON 3.
 *
 * veed-fabric was fixed for exactly this (#veedFabricResumeStepJump): the resume
 * after a paid voice creation overshot Step 2, cost stayed undefined, and Step 3
 * bailed "start over" -- the person had to restart a flow they had already paid
 * into.
 *
 * That test guards ONE FILE. Its own docstring ends: "The charge-step twin
 * (ai-reels-wizard) is owner-routed." The twin was found, understood, and left --
 * and the note about it lives in a test docstring, which is nowhere the owner
 * looks. A deferral nobody can see is indistinguishable from an oversight.
 *
 * So the question is asked over the POPULATION: 17 files drive a wizard with
 * selectStep, exactly one overshoots, and it is listed here by name with the
 * reason it was not simply fixed.
 *
 * WHY IT IS NOT SIMPLY FIXED. In ai-reels-wizard, Step 2 GENERATES THE FIRST
 * VIDEO -- it spends. Making the resume land on Step 2 as intended would add a
 * charge that does not happen today, and adding a charge is the owner's decision,
 * never a repair made in passing. Whether the current behaviour (skip the first
 * generation, land on Step 3) is better or worse for the person is exactly what
 * the owner has to say.
 */
const ROOT = path.resolve(__dirname, '../../..')
const walk = (d: string): string[] =>
  fs.readdirSync(d, { withFileTypes: true }).flatMap(e => {
    const p = path.join(d, e.name)
    if (e.isDirectory()) return walk(p)
    return p.endsWith('.ts') && !p.endsWith('.test.ts') ? [p] : []
  })

const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1')

const OVERSHOOT =
  /\.selectStep\s*\([^)]*\)\s*;?\s*return\s+(?:await\s+)?ctx\.wizard\.next\s*\(\s*\)/

/**
 * Files that overshoot on purpose, with the decision that is pending.
 *
 * EMPTY, AND THAT IS THE POINT OF THE THIRD TEST BELOW. ai-reels-wizard was the
 * only entry: its Step 2 spends, so landing the resume there added a charge and
 * the decision was the owner's. They took it on 2026-09-08 and the file was
 * fixed, so the entry had to go -- which is what a deferral list is for. A list
 * that only grows is an excuse.
 */
const OWNER_ROUTED: Record<string, string> = {}

function scan() {
  const withSelectStep: string[] = []
  const overshooting: string[] = []
  for (const abs of walk(path.join(ROOT, 'src'))) {
    const code = stripComments(fs.readFileSync(abs, 'utf8'))
    if (!/\.selectStep\s*\(/.test(code)) continue
    const rel = path.relative(ROOT, abs).split(path.sep).join('/')
    withSelectStep.push(rel)
    if (OVERSHOOT.test(code)) overshooting.push(rel)
  }
  return { withSelectStep, overshooting }
}

describe('no wizard resume overshoots its step', () => {
  const { withSelectStep, overshooting } = scan()

  it('the population is real: wizards do resume with selectStep', () => {
    // Without this floor, a matcher that stopped matching would read as "all
    // clean" -- the way an empty search always does.
    expect(withSelectStep.length).toBeGreaterThanOrEqual(10)
  })

  it('nothing overshoots except what is listed with its reason', () => {
    const unexplained = overshooting.filter(f => !OWNER_ROUTED[f])
    expect(unexplained).toEqual([])
  })

  it('the list has no stale entries: a fixed file must leave it', () => {
    // The half that keeps a deferral from becoming a permanent excuse.
    const gone = Object.keys(OWNER_ROUTED).filter(
      f => !overshooting.includes(f)
    )
    expect(gone).toEqual([])
  })

  it('the two paid resumes INVOKE their step, they do not just avoid overshooting', () => {
    // Absence of the bug is not presence of the fix. Both of these resume after
    // the person has already paid for a voice, and both must actually run the
    // step they name -- veed-fabric's Step 2 recomputes the cost, ai-reels'
    // Step 2 renders the first video and charges for it.
    for (const f of [
      'src/scenes/lipSyncWizard/veed-fabric-wizard.ts',
      'src/scenes/lipSyncWizard/ai-reels-wizard.ts',
    ]) {
      const code = stripComments(fs.readFileSync(path.join(ROOT, f), 'utf8'))
      expect(code, `${f} no longer invokes its resume step directly`).toMatch(
        /\.steps\[\s*ctx\.wizard\.cursor\s*\]\s*\(\s*ctx\s*\)/
      )
    }
  })

  it('self-check: the matcher sees an overshoot and clears the resume pattern', () => {
    const bad = 'ctx.wizard.selectStep(2)\n      return ctx.wizard.next()'
    const good =
      'ctx.wizard.selectStep(2)\n' +
      '      return await (ctx.wizard as any).steps[ctx.wizard.cursor](ctx)'
    expect(OVERSHOOT.test(bad)).toBe(true)
    expect(OVERSHOOT.test(good)).toBe(false)
    // and a comment quoting the bad form must not count as the bad form
    expect(
      OVERSHOOT.test(
        stripComments('// ctx.wizard.selectStep(2); return ctx.wizard.next()')
      )
    ).toBe(false)
  })
})
