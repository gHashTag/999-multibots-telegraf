/**
 * musicGenerationWizard must not double-charge on a concurrent re-submission
 * (#1357). Step 3 is a live paid text step: it charges (updateUserBalance
 * MONEY_OUTCOME) then awaits the music generation before scene.leave(), so a
 * second text during the ~generation re-enters and double-charges. Same class as
 * #1343/#1355 (proven behaviorally in neuroPhotoDoubleCharge.test.ts).
 *
 * Structural, mutation-checked: the reject-before-set guard must come BEFORE the
 * charge, and the flag must be released (set false). Set-true/false presence is
 * also enforced by paid-wizard-guard-ratchet.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'

const SRC = fs.readFileSync('src/scenes/musicGenerationWizard/index.ts', 'utf8')

describe('musicGenerationWizard in-flight guard (#1357)', () => {
  it('rejects-before-set BEFORE the MONEY_OUTCOME charge', () => {
    const checkIdx = SRC.indexOf('if (ctx.session.musicGenerationInProgress)')
    const setIdx = SRC.indexOf('ctx.session.musicGenerationInProgress = true')
    const chargeIdx = SRC.indexOf(
      'const paymentSuccess = await updateUserBalance('
    )
    expect(checkIdx).toBeGreaterThan(-1)
    expect(setIdx).toBeGreaterThan(-1)
    expect(chargeIdx).toBeGreaterThan(-1)
    expect(checkIdx).toBeLessThan(setIdx)
    expect(setIdx).toBeLessThan(chargeIdx)
  })
  it('releases the flag (set false)', () => {
    expect(SRC).toContain('ctx.session.musicGenerationInProgress = false')
  })
})
