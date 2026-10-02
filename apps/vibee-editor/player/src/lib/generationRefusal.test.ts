import { describe, it, expect } from 'vitest'
import {
  readRefusal,
  generationRefusalText,
  GENERATION_REFUSALS,
} from './generationRefusal'

const cyrillic = /\p{Script=Cyrillic}/u

describe('a failed generation, in the reader language', () => {
  it('reads the server words and code, never the braces', () => {
    const r = readRefusal(
      JSON.stringify({
        success: false,
        error: 'no image provider delivered: fal — 403',
        code: 'generation_failed',
      })
    )
    expect(r).toEqual({
      code: 'generation_failed',
      detail: 'no image provider delivered: fal — 403',
    })
    const shown = generationRefusalText(r, 'en')
    expect(shown).not.toContain('{')
    expect(shown).not.toContain('"success"')
  })

  it('drops a proxy HTML page, keeps plain text', () => {
    expect(readRefusal('<html><body>502</body></html>').detail).toBe('')
    expect(readRefusal('Bad Gateway').detail).toBe('Bad Gateway')
    expect(
      readRefusal(JSON.stringify({ error: 'a', detail: 'b' })).detail
    ).toBe('a: b')
  })

  it('every code has a sentence in both languages, each in its script', () => {
    for (const [code, s] of Object.entries(GENERATION_REFUSALS)) {
      expect(cyrillic.test(s.ru), code).toBe(true)
      expect(cyrillic.test(s.en), code).toBe(false)
    }
  })

  it('a provider failure: the sentence first, the diagnosis after', () => {
    const r = {
      code: 'generation_failed',
      detail: 'ElevenLabs TTS error: 401 - invalid key',
    }
    const ru = generationRefusalText(r, 'ru')
    expect(ru.split('\n')[0]).toBe(GENERATION_REFUSALS.generation_failed.ru)
    expect(ru).toContain('ElevenLabs TTS error: 401')
    expect(generationRefusalText(r, 'en').split('\n')[0]).toBe(
      GENERATION_REFUSALS.generation_failed.en
    )
  })

  it("the caller's own fix, already in the reader's script, stands alone", () => {
    const short = {
      code: 'not_enough_tokens',
      detail: 'не хватает токенов: нужно 20, есть 16', // cyrillic-ok: the server's own refusal text
    }
    expect(generationRefusalText(short, 'ru')).toBe(short.detail)
    // An English reader gets an English headline, the numbers after it.
    const en = generationRefusalText(short, 'en')
    expect(en.split('\n')[0]).toBe(GENERATION_REFUSALS.not_enough_tokens.en)
    expect(en).toContain('16')
  })

  it("the server's English is a developer's line, never the sentence", () => {
    // An expired session: the auth guard says "unauthorized: <reason>", and
    // the owner-only 401 says "verified owner required". An English reader
    // used to get exactly that, and no "sign in again".
    for (const detail of [
      'unauthorized: token expired',
      'verified owner required',
    ]) {
      const en = generationRefusalText({ code: 'sign_in', detail }, 'en')
      expect(en.split('\n')[0]).toBe(GENERATION_REFUSALS.sign_in.en)
      expect(en).toContain(detail)
    }
  })

  it('a clip over the ceiling says too long, the limit after', () => {
    const r = {
      code: 'too_long',
      detail: 'lipsync audio must be 10 seconds or shorter',
    }
    const en = generationRefusalText(r, 'en')
    expect(en.split('\n')[0]).toBe(GENERATION_REFUSALS.too_long.en)
    expect(en).toContain('10 seconds')
    expect(generationRefusalText(r, 'ru').split('\n')[0]).toBe(
      GENERATION_REFUSALS.too_long.ru
    )
  })

  it('an unknown code or none is an honest "did not work"', () => {
    expect(generationRefusalText({ code: 'newer', detail: '' }, 'en')).toBe(
      "It didn't work — try again"
    )
    expect(cyrillic.test(generationRefusalText({ detail: '' }, 'ru'))).toBe(
      true
    )
  })

  it('a long provider dump is cut', () => {
    const shown = generationRefusalText(
      { code: 'generation_failed', detail: 'x'.repeat(5000) },
      'en'
    )
    expect(shown.length).toBeLessThan(300)
  })
})
