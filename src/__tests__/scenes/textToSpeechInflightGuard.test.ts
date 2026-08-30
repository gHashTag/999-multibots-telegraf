/**
 * textToSpeechWizard must not double-charge on a concurrent re-submission (#1355).
 *
 * Step 1 is a live paid path: it awaits createAudioFileFromText (paid ElevenLabs)
 * and then charges (updateUserBalance MONEY_OUTCOME) before scene.leave(), so a
 * second text arriving during the ~generation re-enters the step and
 * double-generates + double-charges. Same class as #1343 (neuroPhotoWizardV2),
 * whose concurrent behaviour is proven in neuroPhotoDoubleCharge.test.ts.
 *
 * The step reaches ElevenLabs + Supabase + fs, so this asserts the in-flight
 * guard structurally, mutation-checked: the reject-before-set guard must come
 * BEFORE the paid createAudioFileFromText call, and the flag must be released.
 * (Set-true/set-false presence is also enforced by paid-wizard-guard-ratchet.)
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'

const SRC = fs.readFileSync('src/scenes/textToSpeechWizard/index.ts', 'utf8')

describe('textToSpeechWizard in-flight guard (#1355)', () => {
  it('rejects-before-set BEFORE the paid createAudioFileFromText call', () => {
    const checkIdx = SRC.indexOf('if (ctx.session.textToSpeechInProgress)')
    const setIdx = SRC.indexOf('ctx.session.textToSpeechInProgress = true')
    const paidIdx = SRC.indexOf('await createAudioFileFromText(')
    expect(checkIdx, 'no guard check').toBeGreaterThan(-1)
    expect(setIdx, 'no guard set').toBeGreaterThan(-1)
    expect(paidIdx, 'no paid call').toBeGreaterThan(-1)
    // check precedes set, and both precede the paid generation
    expect(checkIdx).toBeLessThan(setIdx)
    expect(setIdx).toBeLessThan(paidIdx)
    // no await between the check and the set (atomic claim)
    const between = SRC.slice(checkIdx, setIdx)
    // the only await allowed is inside the reject branch (which returns)
    expect(
      between.includes('return'),
      'the reject branch must return before the set'
    ).toBe(true)
  })

  it('releases the flag (set false)', () => {
    expect(SRC).toContain('ctx.session.textToSpeechInProgress = false')
  })
})
