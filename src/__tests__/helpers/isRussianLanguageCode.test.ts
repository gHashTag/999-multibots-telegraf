import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { isRussianLanguageCode } from '@/helpers/isRussianLanguageCode'

/**
 * Telegram's `from.language_code` is an IETF tag and carries an optional
 * region: 'ru', but also 'ru-RU', 'ru-UA', 'ru-KZ'. Twenty-eight places
 * compared it with `=== 'ru'`, so every one of those users was answered in
 * English. (The first scan said thirty: it counted one line twice and included
 * the users-table COLUMN, which is a stored, already-normalised value and is
 * deliberately still compared strictly.)
 *
 * The three that mattered most are the branches of languageMiddleware -- the
 * single point where the raw code becomes the internal 'ru' | 'en' the rest of
 * the code reads. A new user with a regional Russian locale and no row in the
 * database got an English bot, in a product whose audience is Russian-speaking.
 *
 * This was found by asking which of two implementations a caller reaches:
 * isRussianFromState has two definitions, the one with 103 consumers compared
 * strictly and the one with 2 accepted the 'ru-' prefix. The disagreement was
 * the evidence; the middleware was the cause.
 */

const ROOT = path.resolve(__dirname, '../../..')

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { matchCode } = require('../../../scripts/lib/blank-code.cjs')

/** A comparison of the RAW Telegram code against the bare literal. */
const RAW_COMPARISON = /\b(language_code|telegramLanguage)\s*(===|==)\s*'ru'/g

const productionSources = (): string[] => {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), {
      withFileTypes: true,
    })) {
      const rel = `${dir}/${e.name}`
      if (e.isDirectory()) {
        if (
          e.name !== 'node_modules' &&
          e.name !== '__tests__' &&
          e.name !== 'tests'
        )
          walk(rel)
      } else if (e.name.endsWith('.ts')) out.push(rel)
    }
  }
  walk('src')
  return out
}

describe('isRussianLanguageCode', () => {
  it('accepts a bare tag and every regional variant', () => {
    expect(isRussianLanguageCode('ru')).toBe(true)
    expect(isRussianLanguageCode('ru-RU')).toBe(true)
    expect(isRussianLanguageCode('ru-UA')).toBe(true)
    expect(isRussianLanguageCode('ru_KZ')).toBe(true)
    expect(isRussianLanguageCode('RU')).toBe(true)
    expect(isRussianLanguageCode('Ru-Ru')).toBe(true)
  })

  it('refuses another language whose tag merely starts with ru', () => {
    // The boundary this function exists to get right. A bare startsWith('ru')
    // would answer Rusyn speakers in Russian, which is the same class of
    // mistake as the one being fixed, pointing the other way.
    expect(isRussianLanguageCode('rue')).toBe(false)
    expect(isRussianLanguageCode('rue-SK')).toBe(false)
  })

  it('refuses other languages and absent values', () => {
    expect(isRussianLanguageCode('en')).toBe(false)
    expect(isRussianLanguageCode('en-US')).toBe(false)
    expect(isRussianLanguageCode('')).toBe(false)
    expect(isRussianLanguageCode(undefined)).toBe(false)
    expect(isRussianLanguageCode(null)).toBe(false)
  })

  it('is what every branch of the language middleware uses', () => {
    // The middleware is the single normalisation point: whatever it decides
    // becomes ctx.state.userLanguage for the whole request, and 103 call sites
    // read that. Pinned as a population -- all three branches, so a fourth
    // added later cannot quietly compare strictly again.
    const src = fs.readFileSync(
      path.join(ROOT, 'src/middlewares/languageMiddleware.ts'),
      'utf8'
    )
    const decisions = matchCode(src, /\?\s*'ru'\s*:\s*'en'/g)
    expect(decisions.length, 'middleware must still decide a language').toBe(3)
    expect(matchCode(src, /isRussianLanguageCode\(/g).length).toBe(3)
    expect(matchCode(src, RAW_COMPARISON).length).toBe(0)
  })

  it('leaves no raw comparison anywhere in production code', () => {
    const files = productionSources()
    expect(files.length, 'file walk must find sources').toBeGreaterThan(300)
    const offenders: string[] = []
    for (const f of files) {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8')
      for (const m of matchCode(src, RAW_COMPARISON)) {
        offenders.push(`${f}: ${m[0]}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('the ratchet matcher still recognises the shape it forbids', () => {
    // Control. The rule above is an absence check, and an absence check with a
    // broken matcher reports a clean repository.
    expect(
      matchCode("if (language_code === 'ru') {}", RAW_COMPARISON).length
    ).toBe(1)
    expect(
      matchCode("const x = telegramLanguage === 'ru'", RAW_COMPARISON).length
    ).toBe(1)
    // ...and does not fire on the stored, already-normalised column, which is
    // deliberately left comparing strictly.
    expect(
      matchCode(
        "if (language === 'ru' || language === 'en') {}",
        RAW_COMPARISON
      ).length
    ).toBe(0)
  })
})
