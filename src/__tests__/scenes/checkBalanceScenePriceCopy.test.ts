import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * checkBalanceScene carries a complete private copy of the pricing system, and
 * every number in it disagrees with the canonical one.
 *
 *                          scene    canonical (price/priceCalculator.ts)
 *   costPerStepInStars v1   0.25     0.22
 *   costPerStepInStars v2   2.1      0.5      <- 4.2x
 *   rublesToDollarsRate     100      80
 *
 * It also redefines BASE_COSTS (10 entries against 21), modeCosts (19 against
 * 23), calculateCost, calculateCostInStars, costDetails, minCost and maxCost --
 * and src/scenes/index.ts re-exports the whole file with `export *`.
 *
 * Nothing imports any of it today: every price consumer reaches
 * '@/price/helpers/modelsCost' or '@/price/priceCalculator'. That is the only
 * reason the divergence is harmless, and it is exactly what this pins. An
 * `import { modeCosts } from '@/scenes'` is a plausible autocomplete away, and
 * it would quote a training price 4.2x off without touching a single number.
 *
 * The scene itself is out of the routing: the navigation config marks every
 * button as a direct transition, each commented as CheckBalanceScene being
 * removed, and
 * the one remaining entry sits in handleMenuButtonPress, which has no callers.
 * Inside it, `modeCosts[mode] || 0` feeds `if (currentBalance < costValue)`, so
 * a mode missing from the scene's smaller table passes the balance gate at any
 * balance -- six modes are missing. That path is unreachable today, and the
 * charge itself is guarded independently: processBalanceOperation re-reads the
 * balance and refuses before deducting. Recorded so it does not have to be
 * traced again.
 *
 * These checks do not change a price. Which copy is right is a revenue
 * question and belongs to the owner.
 */

const ROOT = path.resolve(__dirname, '../../..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

const SCENE = 'src/scenes/checkBalanceScene.ts'
const CANON = 'src/price/priceCalculator.ts'

const PRICE_NAMES = [
  'conversionRates',
  'conversionRatesV2',
  'BASE_COSTS',
  'modeCosts',
  'costDetails',
  'stepOptions',
  'minCost',
  'maxCost',
  'calculateCost',
  'calculateCostInStars',
]

function firstNumber(source: string, after: string, field: string): string {
  const start = source.indexOf(after)
  if (start === -1) throw new Error(`${after} not found`)
  const m = source
    .slice(start, start + 400)
    .match(new RegExp(`${field}: ([\\d.]+)`))
  if (!m) throw new Error(`${field} not found after ${after}`)
  return m[1]
}

describe('checkBalanceScene keeps its price copy to itself', () => {
  it('still has both copies to compare', () => {
    // Guards the readers. If either file stopped matching, every expectation
    // below would pass while comparing nothing.
    expect(read(SCENE)).toContain('export const conversionRatesV2')
    expect(read(CANON)).toContain('COST_PER_STEP_IN_STARS_V2')
  })

  it('records that the two rate tables disagree', () => {
    const scene = read(SCENE)
    const canon = read(CANON)
    const canonV2 = canon.match(/COST_PER_STEP_IN_STARS_V2 = ([\d.]+)/)?.[1]
    const sceneV2 = firstNumber(
      scene,
      'export const conversionRatesV2',
      'costPerStepInStars'
    )
    // Not equal, and that is the point. When the owner decides which is right,
    // this expectation has to be revisited rather than silently drift.
    expect(sceneV2).toBe('2.1')
    expect(canonV2).toBe('0.5')
    expect(sceneV2).not.toBe(canonV2)
  })

  it('lets nobody import a price symbol from the scenes barrel', () => {
    // The one-line change that makes the divergence live. The subject is the
    // import STATEMENT, not the file: a file may legitimately import from
    // '@/scenes' and mention a price name for unrelated reasons.
    //
    // __tests__ is skipped, and the first run showed why: this file's own
    // matcher, written out as a regex literal, reads as an import statement,
    // so the check reported ITSELF as the only offender. The claim is about
    // production imports either way.
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(path.join(ROOT, dir), {
        withFileTypes: true,
      })) {
        const rel = `${dir}/${e.name}`
        if (e.isDirectory()) {
          if (e.name !== 'node_modules' && e.name !== '__tests__') walk(rel)
        } else if (e.name.endsWith('.ts')) {
          const src = fs.readFileSync(path.join(ROOT, rel), 'utf8')
          for (const m of src.matchAll(
            /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*['"]([^'"]*scenes(?:\/index)?|[^'"]*checkBalanceScene)['"]/g
          )) {
            const taken = m[1]
              .split(',')
              .map(s =>
                s
                  .trim()
                  .split(/\s+as\s+/)[0]
                  .trim()
              )
              .filter(Boolean)
            const priced = taken.filter(n => PRICE_NAMES.includes(n))
            if (priced.length) offenders.push(`${rel}: ${priced.join(', ')}`)
          }
        }
      }
    }
    walk('src')
    expect(offenders).toEqual([])
  })

  it('keeps every price consumer on the canonical modules', () => {
    // The positive half: modeCosts really is imported, and always from price/.
    const importers: string[] = []
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(path.join(ROOT, dir), {
        withFileTypes: true,
      })) {
        const rel = `${dir}/${e.name}`
        if (e.isDirectory()) {
          if (e.name !== 'node_modules' && e.name !== '__tests__') walk(rel)
        } else if (e.name.endsWith('.ts')) {
          for (const m of fs
            .readFileSync(path.join(ROOT, rel), 'utf8')
            .matchAll(
              /import\s*\{[^}]*\bmodeCosts\b[^}]*\}\s*from\s*['"]([^'"]+)['"]/g
            )) {
            importers.push(m[1])
          }
        }
      }
    }
    walk('src')
    expect(importers.length).toBeGreaterThan(0)
    for (const from of importers) expect(from).toContain('price')
  })
})
