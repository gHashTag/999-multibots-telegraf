import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Tapping a hero button has to resolve back to a hero, and three separate
 * tables in one file decide whether it does.
 *
 * The scene builds each button with getHeroButtonText, which looks the hero up
 * in a heroTranslations table and falls back to `🎨 <name>` when it is absent.
 * The tap handler then resolves the received text through a different table,
 * buttonToHeroMap, with `selectedHero = buttonToHeroMap[receivedText]`. If the
 * rendered text is not a key there, selectedHero is undefined and the tap does
 * nothing at all -- no error, no reply.
 *
 * So the seam is: for every hero the scene offers, the text it renders must be
 * a key in the map the handler reads. Nothing enforced that, and the tables
 * have already drifted apart -- the two heroTranslations copies in this file
 * hold 33 and 16 heroes and are not the same set, and 9 of the 22 heroes the
 * scene actually offers appear in neither, reaching the user through the
 * fallback.
 *
 * Today the invariant holds, because buttonToHeroMap carries 263 keys and
 * covers both the emoji spellings and the fallback ones. That is worth pinning
 * rather than trusting: it holds by breadth, not by construction, and the next
 * hero added to AI_HEROES has no reason to land in it.
 *
 * Read from the SOURCE on purpose. AI_HEROES, heroTranslations and
 * buttonToHeroMap are all module-local -- two of them declared inside wizard
 * step callbacks -- so there is nothing to import, and exporting them only to
 * be tested would change production for the test's convenience.
 *
 * This supersedes the "Button Mapping Validation" group in
 * avatarTransformScene.test.ts, which declares its own AI_HEROES and its own
 * buttonToHeroMap as literals inside the test file and checks them against each
 * other. That group cannot fail for any change to the scene: renaming a hero in
 * all 12 places it appears in production leaves every one of those tests green,
 * and its private roster lists 72 male heroes where the product offers 11.
 */
const SCENE = path.join(
  __dirname,
  '..',
  '..',
  'scenes',
  'avatarTransformScene',
  'index.ts'
)

const source = () => fs.readFileSync(SCENE, 'utf8')

/** The `{...}` starting at or after `from`, matched by brace depth. */
function braceBlock(src: string, from: number): string {
  const start = src.indexOf('{', from)
  let depth = 0
  for (let i = start; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') depth--
    if (depth === 0) return src.slice(start, i + 1)
  }
  return ''
}

function offeredHeroes(src: string): string[] {
  const at = src.indexOf('const AI_HEROES = {')
  const list = (key: string) => {
    const j = src.indexOf(key, at)
    const k = src.indexOf(']', j)
    return [...src.slice(j, k).matchAll(/'([^']+)'/g)].map(m => m[1])
  }
  return [...list('male: ['), ...list('female: [')]
}

/**
 * Russian button text per hero, from EVERY heroTranslations table in the file.
 *
 * The first version of this read only the first table, and that gap hid a real
 * one: the scene declares getHeroButtonText twice, with two separate tables of
 * 33 and 16 heroes. They agree on the 15 they share, but the second one spells
 * 'Гвен Стейси' with a spider emoji while the first has no entry for her at all
 * and falls back to `🎨 ...`. Only the fallback spelling was a key in the
 * handler's map, so the button the second generator draws resolved to nothing.
 *
 * A guard that reads one of two copies is a guard for one of two paths.
 */
function translationTables(src: string): Map<string, string>[] {
  const tables: Map<string, string>[] = []
  let at = src.indexOf('const heroTranslations')
  while (at !== -1) {
    const table = braceBlock(src, src.indexOf('=', at))
    const out = new Map<string, string>()
    for (const m of table.matchAll(/'([^']+)'\s*:\s*\{\s*ru:\s*'([^']+)'/g)) {
      out.set(m[1], m[2])
    }
    tables.push(out)
    at = src.indexOf('const heroTranslations', at + table.length)
  }
  return tables
}

function handlerKeys(src: string): Set<string> {
  const at = src.indexOf('const buttonToHeroMap')
  const table = braceBlock(src, src.indexOf('=', at))
  return new Set([...table.matchAll(/'([^']+)'\s*:/g)].map(m => m[1]))
}

/** What the scene shows for a hero: its translation, or production's fallback. */
const buttonFor = (hero: string, ru: Map<string, string>) =>
  ru.get(hero) ?? `🎨 ${hero}`

describe('every hero the scene offers resolves back through the tap handler', () => {
  /**
   * Without this the rest is worthless: a reader that finds no heroes agrees
   * with every possible state of the scene, and that is exactly how the group
   * this replaces managed to stay green while the tables drifted.
   */
  it('the source reader still finds the heroes and every button table', () => {
    const src = source()
    expect(offeredHeroes(src).length).toBeGreaterThan(0)
    expect(handlerKeys(src).size).toBeGreaterThan(0)
    // Both generators, not just the first: the count is asserted so that a
    // reader which silently stops finding the second one fails here rather
    // than quietly halving what the next test checks.
    const tables = translationTables(src)
    expect(tables.length).toBeGreaterThanOrEqual(2)
    for (const t of tables) expect(t.size).toBeGreaterThan(0)
  })

  it('every offered hero renders a resolvable button in EVERY generator', () => {
    const src = source()
    const keys = handlerKeys(src)
    const heroes = offeredHeroes(src)
    const unresolvable: string[] = []
    translationTables(src).forEach((ru, i) => {
      for (const h of heroes) {
        if (!keys.has(buttonFor(h, ru))) {
          unresolvable.push(`table#${i + 1}: ${h} -> ${buttonFor(h, ru)}`)
        }
      }
    })
    expect(unresolvable).toEqual([])
  })

  it('the fallback spelling is covered too, not only the emoji one', () => {
    const src = source()
    const keys = handlerKeys(src)
    // Heroes with no translation reach the user as `🎨 <name>`, and that exact
    // string is what the handler receives.
    const ru = translationTables(src)[0]
    const viaFallback = offeredHeroes(src).filter(h => !ru.has(h))
    expect(viaFallback.length).toBeGreaterThan(0)
    expect(viaFallback.filter(h => !keys.has(`🎨 ${h}`))).toEqual([])
  })
})
