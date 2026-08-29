/**
 * veed-fabric-wizard estimates a lip-sync duration and prices it via
 * calculateLipSyncCostStars, then gates on `currentBalance < cost`. The only
 * duration guard is an UPPER bound (voice.duration > 30); there is no lower
 * bound. A voice message reporting duration 0 becomes the placeholder
 * 'voice_message_0', which the pricing step parses back as 0 (parseInt('0')),
 * and an empty text yields Math.ceil(0 / 15) = 0. For veed_fabric the price is
 * 14 * durationSeconds, so a 0 duration prices to 0 stars, the balance gate
 * degenerates to `currentBalance < 0` (always false), and a paid Veed Fabric
 * render runs for free on the real full-length audio.
 *
 * Two-part test: (1) behavioral proof of the exploitable premise — the pricing
 * function really returns 0 at duration 0; (2) source-level seam proof that a
 * positive-cost guard now rejects before the balance gate (the guard is inline
 * in a WizardScene step with heavy Telegram/session deps). Mutation — removing
 * the guard or moving it after the gate — fails part 2.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { calculateLipSyncCostStars } from '@/config/lipsync-models.config'

describe('veed-fabric refuses a zero-cost (free) render', () => {
  it('premise: veed_fabric prices a 0-second duration to 0 stars', () => {
    expect(calculateLipSyncCostStars('veed_fabric', 0)).toBe(0)
    // any real duration is priced above zero
    expect(calculateLipSyncCostStars('veed_fabric', 1)).toBeGreaterThan(0)
  })

  it('guard: rejects a non-positive cost BEFORE the balance gate', () => {
    const SRC = path.join(
      __dirname,
      '..',
      '..',
      'scenes',
      'lipSyncWizard',
      'veed-fabric-wizard.ts'
    )
    const stripComments = (s: string) =>
      s
        .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
        .replace(
          /(^|[^:])\/\/.*$/gm,
          (m, p1) => p1 + ' '.repeat(m.length - p1.length)
        )
    const s = stripComments(fs.readFileSync(SRC, 'utf8'))

    const guard = s.search(/if \(!\(cost > 0\)\)/)
    expect(guard, 'no positive-cost guard').toBeGreaterThan(-1)

    // guard must return / leave the scene
    const body = s.slice(guard, guard + 500)
    expect(
      /return ctx\.scene\.leave\(\)/.test(body),
      'the cost guard does not leave the scene'
    ).toBe(true)

    // and it must run before the balance gate it protects
    const gate = s.indexOf('if (currentBalance < cost)')
    expect(gate, 'no balance gate found').toBeGreaterThan(-1)
    expect(guard, 'the cost guard runs after the balance gate').toBeLessThan(
      gate
    )
  })
})
