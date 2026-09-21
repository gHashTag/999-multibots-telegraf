import { describe, expect, it } from 'vitest'
import { translations } from './language'

/**
 * TWO DICTIONARIES THAT MUST HOLD THE SAME KEYS.
 *
 * `t()` returns `translations[lang][key] || key`, so a key added to English
 * and forgotten in Russian does not fail, does not warn and does not fall
 * back to English: it renders its own name. `login.boardTitle` on screen,
 * in a card, to a paying visitor.
 *
 * Comparing the objects is the only check that catches it. Reading line
 * ranges out of the file -- which is what a grep-based check does -- goes
 * stale the first time somebody reorders a block.
 */
describe('the two locales agree', () => {
  const en = Object.keys(translations.en).sort()
  const ru = Object.keys(translations.ru).sort()

  it('every English key exists in Russian', () => {
    expect(en.filter(k => !(k in translations.ru))).toEqual([])
  })

  it('every Russian key exists in English', () => {
    expect(ru.filter(k => !(k in translations.en))).toEqual([])
  })

  it('the login card is fully translated in both', () => {
    const keys = [
      'login.title',
      'login.subtitle',
      'login.exportTitle',
      'login.generateTitle',
      'login.rendersBody',
      'login.followTitle',
      'login.followBody',
      'login.boardTitle',
      'login.boardBody',
    ]
    for (const k of keys) {
      expect(translations.en[k], `en ${k}`).toBeTruthy()
      expect(translations.ru[k], `ru ${k}`).toBeTruthy()
      // A copied-through English line is a missing translation that passes a
      // key-set check.
      expect(translations.ru[k], `ru ${k} is not the English line`).not.toBe(
        translations.en[k]
      )
    }
  })

  it('the retired return-to-game line is gone from both', () => {
    // It named one door out of seven and was shown at all of them.
    expect(translations.en['login.returnToGame']).toBeUndefined()
    expect(translations.ru['login.returnToGame']).toBeUndefined()
  })
})
