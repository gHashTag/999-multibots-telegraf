/**
 * Ratchet: the veed-fabric resume branch does not overshoot Step 2 with a
 * selectStep + next() off-by-one.
 *
 * After the user creates a voice mid-flow, voiceAvatarWizard re-enters
 * VeedFabricLipSync; Step 0 detects the resume and must land on Step 2 (recompute
 * cost + show the Confirm button). The old code did `selectStep(2); return
 * ctx.wizard.next()`, but next() = selectStep(cursor + 1), so it overshot to
 * cursor 3 and skipped Step 2 -- cost stayed undefined and Step 3 bailed "start
 * over". The advertised resume was broken (the user had to restart the whole
 * flow; their paid 30-star voice persisted but the wizard state was lost).
 *
 * The fix invokes Step 2 directly (steps[cursor](ctx)), the wizard's own resume
 * pattern (ai-reels-render-wizard). This pins that no ctx.wizard.selectStep is
 * immediately followed by a return of ctx.wizard.next() in this file. Structural
 * -> self-check + floor + mutation-verified. loop-fable iter220 (wave-20
 * wizard-stepjump lens). The charge-step twin (ai-reels-wizard) is owner-routed.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const FILE = path.resolve(
  __dirname,
  '../../scenes/lipSyncWizard/veed-fabric-wizard.ts'
)

function stripComments(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function analyze(source: string): {
  hasSelectStep: boolean
  overshoots: boolean
} {
  const code = stripComments(source)
  const hasSelectStep = /\.selectStep\s*\(/.test(code)
  // The off-by-one: selectStep(...) immediately followed by return ...wizard.next()
  const overshoots =
    /\.selectStep\s*\([^)]*\)\s*;?\s*return\s+(?:await\s+)?ctx\.wizard\.next\s*\(\s*\)/.test(
      code
    )
  return { hasSelectStep, overshoots }
}

describe('veed-fabric resume does not overshoot Step 2 (no selectStep + next off-by-one)', () => {
  const source = fs.readFileSync(FILE, 'utf8')
  const a = analyze(source)

  // matcher-not-stale floor: the resume jump this guards still exists.
  it('floor: the wizard still uses selectStep to resume', () => {
    expect(a.hasSelectStep).toBe(true)
  })

  it('no selectStep is followed by a return of ctx.wizard.next()', () => {
    expect(a.overshoots).toBe(false)
  })

  it('self-check: a selectStep+next() overshoot is detected', () => {
    const bad = `async ctx => {
      ctx.wizard.selectStep(2)
      return ctx.wizard.next()
    }`
    expect(analyze(bad).overshoots).toBe(true)

    const good = `async ctx => {
      ctx.wizard.selectStep(2)
      return await (ctx.wizard as any).steps[ctx.wizard.cursor](ctx)
    }`
    expect(analyze(good).overshoots).toBe(false)
    expect(analyze(good).hasSelectStep).toBe(true)
  })
})
