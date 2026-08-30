/**
 * lipSyncWizard/ai-reels-wizard must not double-charge on a concurrent
 * re-submission (#1366, cluster #1358). The step charges (updateUserBalance
 * MONEY_OUTCOME) then generates the AI-reels inline before scene.leave(), so a
 * second message during the ~generation re-enters and double-charges. Same class
 * as #1343/#1355/#1357/#1360/#1362/#1364 (proven in neuroPhotoDoubleCharge.test.ts).
 *
 * Structural, mutation-checked: reject-before-set must precede the charge; the
 * flag must be released. Set-true/false presence is also enforced by
 * paid-wizard-guard-ratchet.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'

const SRC = fs.readFileSync(
  'src/scenes/lipSyncWizard/ai-reels-wizard.ts',
  'utf8'
)

describe('ai-reels-wizard in-flight guard (#1366)', () => {
  it('rejects-before-set BEFORE the MONEY_OUTCOME charge', () => {
    const checkIdx = SRC.indexOf('if (ctx.session.aiReelsInProgress)')
    const setIdx = SRC.indexOf('ctx.session.aiReelsInProgress = true')
    const chargeIdx = SRC.indexOf(
      'const paymentSuccess = await updateUserBalance('
    )
    expect(checkIdx).toBeGreaterThan(-1)
    expect(setIdx).toBeGreaterThan(-1)
    expect(chargeIdx).toBeGreaterThan(-1)
    expect(checkIdx).toBeLessThan(setIdx)
    expect(setIdx).toBeLessThan(chargeIdx)
  })
  it('releases the flag (set false) in a leave handler', () => {
    expect(SRC).toContain('ctx.session.aiReelsInProgress = false')
    expect(SRC).toContain('aiReelsWizard.leave(')
  })
})
