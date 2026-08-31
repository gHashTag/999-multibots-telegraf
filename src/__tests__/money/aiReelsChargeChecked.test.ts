/**
 * ai-reels-render-wizard Step 6 charged the user via updateUserBalance(...) but
 * IGNORED the result and then dispatched the render-server event. updateUserBalance
 * returns false on a failed debit (it does not throw), so a charge that fails --
 * a concurrent spend depleting the balance after the pre-check, or a DB error --
 * still rendered+delivered the video: unbilled-paid (free render). The scene is
 * registered (registerCommands.ts:62,1038), so the path is live.
 *
 * Fix: capture the charge result and abort BEFORE the render dispatch if !charged
 * (additive guard that SKIPS generation on a failed charge -- no refund, no mint).
 * Mirrors the paymentSuccess guard in veed-fabric / voiceTraining wizards.
 *
 * Source seam: the charge is captured and a !charged guard returns before the
 * "Sending event to render-server" dispatch. Mutation (dropping the guard) fails.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const stripComments = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(
      /(^|[^:])\/\/.*$/gm,
      (m, p1) => p1 + ' '.repeat(m.length - p1.length)
    )

const code = () =>
  stripComments(
    fs.readFileSync(
      path.join(
        __dirname,
        '..',
        '..',
        'scenes',
        'lipSyncWizard',
        'ai-reels-render-wizard.ts'
      ),
      'utf8'
    )
  )

describe('ai-reels render charges before dispatch (no unbilled free render)', () => {
  it('captures the updateUserBalance result and guards the render dispatch on it', () => {
    const s = code()
    // the Step 6 render charge
    const charge = s.indexOf('AI Reels Render (')
    expect(charge, 'no AI Reels Render charge found').toBeGreaterThan(-1)
    // the render-server dispatch that must be gated behind the charge
    const dispatch = s.indexOf('Sending event to render-server')
    expect(dispatch, 'no render dispatch found').toBeGreaterThan(charge)
    const between = s.slice(charge, dispatch)
    expect(
      /const\s+charged\s*=\s*await\s+updateUserBalance/.test(
        s.slice(Math.max(0, charge - 400), charge)
      ),
      'the render charge result is not captured -- a failed charge cannot be detected'
    ).toBe(true)
    expect(
      /if\s*\(\s*!charged\s*\)/.test(between) &&
        /scene\.leave\(\)/.test(between),
      'no !charged guard returns before the render dispatch -- a failed charge still renders for free'
    ).toBe(true)
  })
})
