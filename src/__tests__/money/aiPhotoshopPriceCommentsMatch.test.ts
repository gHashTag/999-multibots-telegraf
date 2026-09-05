import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Each price in the AI Photoshop table states its own result in a comment:
 *
 *   seedream: calculateFinalPriceInStars(this.modelsUSD.seedream, 0.016, this.markup), // $0.03 -> 5*
 *
 * Nine of those ten claims were wrong when this was written. The arithmetic
 * gives 4, not 5: 0.03 / 0.016 = 1.875, times the 2.4 markup is 4.5, and the
 * function floors. The comments record the price somebody INTENDED, and the
 * block header says so outright -- the markup was picked "to reach the target
 * prices 5+6+5+5=21". Those four actually compute to 4+5+4+4 = 17.
 *
 * Nobody was overcharged. `models.X` feeds `cost`, and `cost` is what the
 * button label shows AND what the batch charges, so the user sees the same
 * number they pay. The divergence is between the code and its own
 * documentation -- which is exactly the kind that survives for months,
 * because every reader who checks the comment instead of the arithmetic
 * comes away believing the wrong number.
 *
 * The price itself is NOT touched here. Moving from floor to round, or
 * raising the markup to hit 21, would increase what people are charged, and
 * that is the owner's decision, not a repair. Recorded in the owner queue.
 *
 * Three separate claims are checked, because they fail in different ways:
 *
 *   the key matches its own USD entry  -- a copy-paste that points one model
 *                                         at another's cost mis-prices it
 *   the comment's USD matches the table
 *   the comment's star price matches what the function computes
 */

const SCENE = path.resolve(
  __dirname,
  '..',
  '..',
  'scenes',
  'aiPhotoshopScene',
  'index.ts'
)

/** The same arithmetic as calculateFinalPriceInStars, kept in one place. */
const priceInStars = (usd: number, starCost: number, markup: number) =>
  Math.floor((usd / starCost) * markup)

interface Entry {
  key: string
  usdKey: string
  starCost: number
  claimedUsd: number
  claimedStars: number
}

function read() {
  const raw = fs.readFileSync(SCENE, 'utf8')

  const markupMatch = raw.match(/markup:\s*([\d.]+),/)
  expect(markupMatch, 'the markup line moved or was renamed').not.toBeNull()
  const markup = Number(markupMatch![1])

  const usd: Record<string, number> = {}
  const usdBlock = raw.match(/modelsUSD:\s*\{([\s\S]*?)\n\s{2}\},/)
  expect(usdBlock, 'the modelsUSD table moved or was renamed').not.toBeNull()
  for (const m of usdBlock![1].matchAll(/^\s*(\w+):\s*([\d.]+),/gm)) {
    usd[m[1]] = Number(m[2])
  }

  const entries: Entry[] = []
  const re =
    /(\w+):\s*calculateFinalPriceInStars\(\s*this\.modelsUSD\.(\w+),\s*([\d.]+),\s*this\.markup\s*\),\s*\/\/\s*\$([\d.]+)\s*→\s*(\d+)⭐/g
  for (const m of raw.matchAll(re)) {
    entries.push({
      key: m[1],
      usdKey: m[2],
      starCost: Number(m[3]),
      claimedUsd: Number(m[4]),
      claimedStars: Number(m[5]),
    })
  }
  return { markup, usd, entries }
}

describe('AI Photoshop price comments state what the code computes', () => {
  it('reads the table and the annotated entries', () => {
    // Every check below is a filter over `entries`. An empty list satisfies
    // all of them, so a moved table or a reworded comment would turn this
    // file green while checking nothing at all.
    const { markup, usd, entries } = read()
    expect(markup, 'markup vanished').toBeGreaterThan(0)
    expect(
      Object.keys(usd).length,
      'the USD table parsed as empty'
    ).toBeGreaterThan(5)
    expect(
      entries.length,
      'no annotated price entries found -- the comment shape changed and this ratchet is judging nothing'
    ).toBeGreaterThan(5)
  })

  it('points every entry at its own USD cost', () => {
    // A copy-paste here is a real mis-price: the model would be sold at
    // another model's cost, silently and in both directions.
    const { entries } = read()
    const crossed = entries
      .filter(e => e.key !== e.usdKey)
      .map(e => `${e.key} priced from modelsUSD.${e.usdKey}`)
    expect(crossed, 'a model is priced from another model’s cost').toEqual([])
  })

  it('quotes the USD figure the table actually holds', () => {
    const { usd, entries } = read()
    const wrong = entries
      .filter(e => usd[e.usdKey] !== e.claimedUsd)
      .map(
        e =>
          `${e.key}: comment says $${e.claimedUsd}, table says $${usd[e.usdKey]}`
      )
    expect(
      wrong,
      'a comment quotes a USD cost the table does not hold'
    ).toEqual([])
  })

  it('states the star price the function really returns', () => {
    // The one that was failing: nine of ten comments were a whole star above
    // the computed value, because they recorded the intended price rather
    // than the floored one.
    const { markup, usd, entries } = read()
    const wrong = entries
      .filter(
        e => priceInStars(usd[e.usdKey], e.starCost, markup) !== e.claimedStars
      )
      .map(
        e =>
          `${e.key}: comment says ${e.claimedStars} stars, ` +
          `floor($${usd[e.usdKey]} / ${e.starCost} * ${markup}) = ` +
          `${priceInStars(usd[e.usdKey], e.starCost, markup)}`
      )
    expect(
      wrong,
      'a price comment claims a number the code does not produce. Fix the ' +
        'COMMENT, not the price -- changing the price changes what people ' +
        'are charged, and that is the owner’s call:\n'
    ).toEqual([])
  })
})
