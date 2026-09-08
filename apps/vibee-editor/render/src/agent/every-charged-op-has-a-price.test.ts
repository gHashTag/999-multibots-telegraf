import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { spendByTid, TOKEN_PRICES, OPERATION_COST_USD } from './billing-shared'

/*
 * A GENERATION WITH NO PRICE USED TO BE FREE, SILENTLY.
 *
 * spendByTid returned { ok: true } with no amount when the op was missing from
 * the price table: the work ran, the receipt was empty, and nothing said it
 * had cost nothing. Every op charged today is priced, so that branch is
 * unreachable -- and the way it becomes reachable is somebody adding a fifth
 * operation and forgetting the table.
 *
 * Two halves, and the second is the one a unit test alone would miss: the
 * refusal is pinned by behaviour, and the POPULATION is pinned by reading the
 * source for every op string actually handed to a charge. A rule about "every
 * op" is worth only as much as its list of ops.
 */
const pool = {
  query: async () => ({ rows: [{ balance: 1_000_000 }], rowCount: 1 }),
}

/** Op strings passed to a charge anywhere in the render app, from source. */
function chargedOps(): Map<string, string[]> {
  const root = path.join(__dirname, '..', '..')
  const files: string[] = []
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name)
      if (e.isDirectory()) {
        if (!/node_modules|dist|\.git/.test(f)) walk(f)
      } else if (/\.tsx?$/.test(f) && !/\.test\./.test(f)) files.push(f)
    }
  }
  walk(root)
  const used = new Map<string, string[]>()
  for (const f of files) {
    const t = fs.readFileSync(f, 'utf8')
    for (const m of t.matchAll(
      /(?:spendByTid|chargeMiniAppUser)\s*\(([\s\S]{0,200}?)\)/g
    )) {
      for (const s of m[1].matchAll(/'([a-z_]{3,30})'/g)) {
        const op = s[1]
        if (!/_generate$|_render$|_edit$|_upscale$/.test(op)) continue
        used.set(op, [...(used.get(op) ?? []), path.relative(root, f)])
      }
    }
  }
  return used
}

describe('an operation without a price is refused, not given away', () => {
  it('refuses an unpriced op instead of reporting a free success', async () => {
    const r = await spendByTid(
      pool as never,
      '999',
      'op_that_has_no_price_generate',
      1
    )
    expect(r.ok).toBe(false)
    expect(String(r.причина)).toContain('op_that_has_no_price_generate') // cyrillic-ok: public API field
  })

  it('still charges a priced op, so the refusal is not blanket', async () => {
    const r = await spendByTid(pool as never, '999', 'image_generate', 1)
    expect(r.ok).toBe(true)
    expect(Number(r.списано)).toBeGreaterThan(0) // cyrillic-ok: public API field
  })

  it('every op the code actually charges has a price', () => {
    const used = chargedOps()
    // The population, printed: a rule about "every op" is worth its list.
    expect(
      used.size,
      'no charge sites found — the matcher, not the code'
    ).toBeGreaterThan(0)
    const unpriced = [...used.keys()].filter(
      op => !TOKEN_PRICES[op] && OPERATION_COST_USD[op] == null
    )
    expect(unpriced, `charged but unpriced: ${unpriced.join(', ')}`).toEqual([])
  })
})
