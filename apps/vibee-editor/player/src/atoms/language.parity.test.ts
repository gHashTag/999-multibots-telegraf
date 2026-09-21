import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
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

/**
 * THE KEY THAT IS MISSING FROM BOTH DICTIONARIES.
 *
 * Comparing the two locales to each other is a symmetric-difference check: a
 * key that `t()` calls and NEITHER dictionary defines is equally absent from
 * both and sails through. That is not hypothetical -- it is how `assets.empty`
 * and `common.loading` came to render as their own names on screen, in both
 * languages, while all four cases above were green.
 *
 * So compare the call sites to the dictionary, not the dictionary to itself.
 */
describe('every key a component asks for exists', () => {
  const SRC = path.resolve(__dirname, '..')

  function sources(): string[] {
    const out: string[] = []
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name)
        if (e.isDirectory()) {
          if (e.name !== 'node_modules') walk(p)
        } else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
          out.push(p)
        }
      }
    }
    walk(SRC)
    return out
  }

  it('no live t() call names a key neither locale defines', () => {
    const missing = new Map<string, string[]>()
    for (const file of sources()) {
      // Comments are not call sites. The doc comment on translateAtom shows
      // the substitution form as `t('hive.andMore', { n: 4 })`, and a scan
      // that reads it reports a missing key for an example. One such false
      // name in the output and the whole list stops being believed.
      const s = fs
        .readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^[^\S\n]*\/\/.*$/gm, '')
      // Literal calls only: t(`x.${y}`) and t(variable) cannot be resolved by
      // reading, and a check that pretends otherwise reports noise.
      for (const m of s.matchAll(
        /\bt\(\s*'([a-zA-Z][\w.]*\.[\w.]+)'\s*[),]/g
      )) {
        const key = m[1]
        if (key in translations.en || key in translations.ru) continue
        const where = missing.get(key) ?? []
        where.push(path.relative(SRC, file))
        missing.set(key, where)
      }
    }
    expect(Object.fromEntries(missing)).toEqual({})
  })
})
