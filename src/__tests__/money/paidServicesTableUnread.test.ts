import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * There are two tables of what a service costs in dollars:
 *
 *   src/price/helpers/modelsCost.ts   BASE_COSTS        21 modes
 *   src/interfaces/paidServices.ts    PAID_SERVICES_CONFIG   9 services
 *
 * Eight names appear in both. Seven agree. LipSync does not: 0.9 against 0.14,
 * a factor of six.
 *
 * It is harmless today for one reason only, and it is not the reason the file
 * looks like it has: PAID_SERVICES_CONFIG has NO readers outside its own file.
 * The three modules that import from paidServices.ts take
 * calculateFinalPriceInStars, which accepts a raw dollar number and never
 * consults the table. So the divergent entry is unread data sitting in a live
 * file -- and the next person to wire the table up gets a LipSync price six
 * times off.
 *
 * Which number is right is a revenue question, so nothing here changes a price.
 * These checks keep the situation from changing silently: the agreement of
 * every other shared service is pinned, the one disagreement is pinned to its
 * exact pair so editing either side has to pass through this file, and the
 * absence of readers -- the thing actually keeping it harmless -- is pinned
 * too.
 */

const ROOT = path.resolve(__dirname, '../../..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

const PAID = 'src/interfaces/paidServices.ts'
const COSTS = 'src/price/helpers/modelsCost.ts'

function paidServiceCosts(): Map<string, string> {
  const out = new Map<string, string>()
  for (const m of read(PAID).matchAll(
    /\[PaidServiceEnum\.(\w+)\]:\s*\{[^}]*?baseCostUSD:\s*([\d.]+)/g
  )) {
    out.set(m[1], m[2])
  }
  return out
}

function baseCosts(): Map<string, string> {
  const out = new Map<string, string>()
  for (const m of read(COSTS).matchAll(/\[ModeEnum\.(\w+)\]:\s*([\d.]+)/g)) {
    out.set(m[1], m[2])
  }
  return out
}

/** The one disagreement, recorded so it cannot grow or vanish unnoticed. */
const KNOWN_DIVERGENCE = new Map([['LipSync', { paid: '0.9', base: '0.14' }]])

describe('the two dollar-cost tables', () => {
  it('both still parse', () => {
    // Guards the readers. If either matcher stopped matching, every comparison
    // below would pass over an empty map.
    expect(paidServiceCosts().size).toBeGreaterThanOrEqual(8)
    expect(baseCosts().size).toBeGreaterThanOrEqual(15)
  })

  it('agree on every shared service except the recorded one', () => {
    const paid = paidServiceCosts()
    const base = baseCosts()
    const shared = [...paid.keys()].filter(k => base.has(k))
    expect(shared.length).toBeGreaterThanOrEqual(8)

    const disagreeing = shared.filter(k => paid.get(k) !== base.get(k))
    expect(disagreeing.sort()).toEqual([...KNOWN_DIVERGENCE.keys()].sort())
  })

  it('pins the recorded disagreement to its exact pair', () => {
    const paid = paidServiceCosts()
    const base = baseCosts()
    for (const [name, want] of KNOWN_DIVERGENCE) {
      expect(paid.get(name), `${name} in paidServices`).toBe(want.paid)
      expect(base.get(name), `${name} in BASE_COSTS`).toBe(want.base)
    }
  })

  it('keeps the divergent table unread, which is what makes it harmless', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { matchCode } = require('../../../scripts/lib/blank-code.cjs')
    const readers: string[] = []
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(path.join(ROOT, dir), {
        withFileTypes: true,
      })) {
        const rel = `${dir}/${e.name}`
        if (e.isDirectory()) {
          if (e.name !== '__tests__' && e.name !== 'node_modules') walk(rel)
        } else if (e.name.endsWith('.ts') && !rel.includes('paidServices')) {
          const src = fs.readFileSync(path.join(ROOT, rel), 'utf8')
          if (matchCode(src, /\bPAID_SERVICES_CONFIG\b/g).length)
            readers.push(rel)
        }
      }
    }
    walk('src')
    expect(readers).toEqual([])
  })
})
