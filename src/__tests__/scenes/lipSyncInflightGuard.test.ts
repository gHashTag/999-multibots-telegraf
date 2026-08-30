/**
 * lipSyncWizard/index must not double-charge on a concurrent re-submission
 * (#1364, cluster #1358). The step charges (updateUserBalance MONEY_OUTCOME) then
 * processes the lip-sync before scene.leave(), so a second message during the
 * ~generation re-enters and double-charges. Same class as #1343/#1355/#1357/
 * #1360/#1362/#1363 (proven behaviorally in neuroPhotoDoubleCharge.test.ts).
 *
 * Structural, mutation-checked: reject-before-set must precede the charge; the
 * flag must be released. Set-true/false presence is also enforced by
 * paid-wizard-guard-ratchet.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'

const SRC = fs.readFileSync('src/scenes/lipSyncWizard/index.ts', 'utf8')

describe('lipSyncWizard in-flight guard (#1364)', () => {
  it('rejects-before-set BEFORE the MONEY_OUTCOME charge', () => {
    const checkIdx = SRC.indexOf('if (ctx.session.lipSyncInProgress)')
    const setIdx = SRC.indexOf('ctx.session.lipSyncInProgress = true')
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
    expect(SRC).toContain('ctx.session.lipSyncInProgress = false')
    expect(SRC).toContain('lipSyncWizard.leave(')
  })
})
