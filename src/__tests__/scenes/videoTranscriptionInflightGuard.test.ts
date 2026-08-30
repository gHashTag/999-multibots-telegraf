/**
 * videoTranscriptionWizard must not double-charge on a concurrent re-submission
 * (#1360, cluster #1358). Step 1 charges (updateUserBalance MONEY_OUTCOME) then
 * awaits the transcription before scene.leave(), so a second message during the
 * ~transcription re-enters and double-charges. Same class as #1343/#1355/#1357
 * (proven behaviorally in neuroPhotoDoubleCharge.test.ts).
 *
 * Structural, mutation-checked: reject-before-set must precede the charge, and
 * the flag must be released. Set-true/false presence is also enforced by
 * paid-wizard-guard-ratchet.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'

const SRC = fs.readFileSync(
  'src/scenes/videoTranscriptionWizard/index.ts',
  'utf8'
)

describe('videoTranscriptionWizard in-flight guard (#1360)', () => {
  it('rejects-before-set BEFORE the MONEY_OUTCOME charge', () => {
    const checkIdx = SRC.indexOf(
      'if (ctx.session.videoTranscriptionInProgress)'
    )
    const setIdx = SRC.indexOf(
      'ctx.session.videoTranscriptionInProgress = true'
    )
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
    expect(SRC).toContain('ctx.session.videoTranscriptionInProgress = false')
    expect(SRC).toContain('videoTranscriptionWizard.leave(')
  })
})
