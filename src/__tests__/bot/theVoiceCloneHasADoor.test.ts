/**
 * THE THIRD PIECE OF A DIGITAL CLONE HAD NO DOOR.
 *
 * Owner, 2026-09-17: the welcome screen should set up the clone -- SOUL, the
 * client's voice saved to the database, and a photo for lipsync.
 *
 * Measured the same night: SOUL is a real step in the mini app's welcome and
 * lands in the database; the Telegram avatar is stored at registration. The
 * voice existed too -- `voiceAvatarWizard` creates an ElevenLabs voice and
 * writes voice_id to the user row -- but nothing could SEND anybody there. The
 * only card named "voice" points at text-to-speech, which reads a text aloud
 * and makes no copy of anyone.
 *
 * A feature reachable only by someone who already knows where it lives is, for
 * onboarding purposes, a feature that does not exist.
 */
import { describe, it, expect } from 'vitest'
import {
  SERVICE_CARDS,
  START_PARAM_PREFIX,
  serviceFromStartParam,
} from '@/handlers/inlineQuery'
import { ModeEnum } from '@/interfaces/modes'

describe('the voice clone can be linked to', () => {
  it('has a card of its own, separate from text-to-speech', () => {
    const clone = SERVICE_CARDS.find(c => c.key === 'voiceclone')
    const tts = SERVICE_CARDS.find(c => c.key === 'voice')
    expect(clone, 'no card leads to the voice clone').toBeTruthy()
    expect(clone?.mode).toBe(ModeEnum.Voice)
    expect(tts?.mode).toBe(ModeEnum.TextToSpeech)
    expect(clone?.mode, 'both cards lead to the same scene').not.toBe(tts?.mode)
  })

  /*
   * The whole point is the deep link: this is what a welcome step, a landing
   * page or a card in another chat would put behind a button.
   */
  it('a start parameter lands in the voice scene', () => {
    const card = serviceFromStartParam(`${START_PARAM_PREFIX}voiceclone`)
    expect(card?.mode).toBe(ModeEnum.Voice)
  })

  it('does not answer to a parameter that was never issued', () => {
    expect(serviceFromStartParam(`${START_PARAM_PREFIX}voicecl`)).toBeFalsy()
    expect(serviceFromStartParam('voiceclone')).toBeFalsy()
  })

  /*
   * Every card is an inline result and a deep link at once, so a key that
   * collides or a mode nobody can enter would break the card list rather than
   * this feature.
   */
  it('keeps every key unique', () => {
    const keys = SERVICE_CARDS.map(c => c.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
