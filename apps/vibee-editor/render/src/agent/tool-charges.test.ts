import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TOKEN_PRICES } from './billing-shared'
import { TOOLS } from './tools'
import {
  chargingToolNames,
  chargingTools,
  registerChargingTools,
  toolPrice,
  type ChargeDecl,
} from './tool-charges'

/**
 * WHICH TOOLS CHARGE IS DERIVED, AND THE DERIVATION IS KEPT HONEST.
 *
 * crm-duet.t27 v5: any tool with a price > 0 is refused in a dry run. The
 * price of a tool is read from TOKEN_PRICES -- its own entry, or the entries
 * of what it `charges` (tool-charges.ts). The unit tests pin the reading; the
 * structural guards below pin the declarations to the code that spends, so
 * a new charge site cannot leave its tool looking free.
 */

const PRICES = { op_a: 5, op_b: 0, op_big: 1200 } as const
const decls = (...ds: ChargeDecl[]) => new Map(ds.map(d => [d.name, d]))

describe('toolPrice', () => {
  it('reads its own entry, the ops it charges, and the tools it borrows', () => {
    const by = decls(
      { name: 'op_a' },
      { name: 'free_tool' },
      { name: 'clone', charges: ['op_big'] },
      { name: 'borrower', charges: ['op_a', 'free_tool'] },
      { name: 'deep', charges: ['borrower'] },
      { name: 'zero', charges: ['op_b', 'free_tool'] }
    )
    expect(toolPrice('op_a', by, PRICES)).toBe(5)
    expect(toolPrice('free_tool', by, PRICES)).toBe(0)
    expect(toolPrice('clone', by, PRICES)).toBe(1200)
    expect(toolPrice('borrower', by, PRICES)).toBe(5)
    expect(toolPrice('deep', by, PRICES)).toBe(5)
    expect(toolPrice('zero', by, PRICES)).toBe(0)
    expect(toolPrice('unknown', by, PRICES)).toBe(0)
  })

  it('takes the highest price, and a cycle ends instead of looping', () => {
    const by = decls(
      { name: 'op_a', charges: ['op_big'] },
      { name: 'x', charges: ['y'] },
      { name: 'y', charges: ['x', 'op_a'] }
    )
    expect(toolPrice('op_a', by, PRICES)).toBe(1200)
    expect(toolPrice('x', by, PRICES)).toBe(1200)
    const loop = decls(
      { name: 'p', charges: ['q'] },
      { name: 'q', charges: ['p'] }
    )
    expect(toolPrice('p', loop, PRICES)).toBe(0)
  })

  it('chargingToolNames keeps exactly the tools whose price is > 0', () => {
    const tools: ChargeDecl[] = [
      { name: 'op_a' },
      { name: 'op_b' },
      { name: 'free_tool' },
      { name: 'clone', charges: ['op_big'] },
    ]
    expect([...chargingToolNames(tools, PRICES)].sort()).toEqual([
      'clone',
      'op_a',
    ])
  })
})

describe('the registry hands over its charging tools', () => {
  it('a read before the registry loads fails closed', () => {
    const slot = Symbol.for('vibee.render.chargingTools')
    const g = globalThis as unknown as Record<symbol, unknown>
    const saved = g[slot]
    try {
      delete g[slot]
      expect(() => chargingTools()).toThrow('has not loaded')
    } finally {
      g[slot] = saved
    }
    // Registering again from the same registry yields the same names.
    const before = [...chargingTools()].sort()
    registerChargingTools(TOOLS)
    expect([...chargingTools()].sort()).toEqual(before)
  })

  it('the registered set is the registry walked against TOKEN_PRICES', () => {
    const by = new Map(TOOLS.map(t => [t.name, t]))
    const walked = TOOLS.filter(t => toolPrice(t.name, by) > 0).map(t => t.name)
    expect(new Set(chargingTools())).toEqual(new Set(walked))
    // Positive control: the four a hand-kept list missed are found.
    for (const t of [
      'lipsync_generate',
      'story_reel',
      'split_reel',
      'crm_voice_clone',
    ])
      expect(chargingTools().has(t), t).toBe(true)
  })

  it('a charges entry names a priced op or a registered tool, never a typo', () => {
    const names = new Set(TOOLS.map(t => t.name))
    for (const t of TOOLS)
      for (const c of t.charges ?? [])
        expect(
          names.has(c) || (TOKEN_PRICES[c] ?? 0) > 0,
          `${t.name} charges ${c}`
        ).toBe(true)
  })
})

/**
 * The code that spends, read as text. A site is `spendTokens(ctx, '<op>')`
 * (the charge helper in tools.ts) or a borrowed tool:
 * `lookup('<tool>')` / `.find(t => t.name === '<tool>')`.
 */
describe('every charge site is reached by a priced tool', () => {
  const DIR = __dirname
  const files = readdirSync(DIR)
    .filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .map(f => ({ f, text: readFileSync(join(DIR, f), 'utf8') }))
  const by = new Map(TOOLS.map(t => [t.name, t]))
  const priceOf = (n: string) =>
    by.has(n) ? toolPrice(n, by) : (TOKEN_PRICES[n] ?? 0)
  const SITES = [
    /spendTokens\(\s*ctx\s*,\s*'([a-z_0-9]+)'/g,
    /lookup\('([a-z_0-9]+)'\)/g,
    /\.find\(\s*t\s*=>\s*t\.name\s*===\s*'([a-z_0-9]+)'\s*\)/g,
  ]
  const pricedSites = files.flatMap(({ f, text }) =>
    SITES.flatMap(re => [...text.matchAll(re)].map(m => m[1]))
      .filter(n => priceOf(n) > 0)
      .map(n => ({ f, n, text }))
  )

  it('the scanner finds the charge sites at all', () => {
    // An empty match set would pass every check below vacuously.
    const spending = new Set(pricedSites.map(s => s.f))
    for (const f of [
      'tools.ts',
      'story-reel-tool.ts',
      'split-reel-tool.ts',
      'crm-deliver-tool.ts',
      'agent-avatars.ts',
      'story-deps.ts',
    ])
      expect(spending, f).toContain(f)
    expect(pricedSites.map(s => s.n)).toContain('voice_clone')
  })

  it('every priced op that is spent is a tool or charged by one', () => {
    const reached = new Set<string>()
    for (const t of TOOLS) {
      reached.add(t.name)
      for (const c of t.charges ?? []) reached.add(c)
    }
    for (const { f, n } of pricedSites)
      expect(reached.has(n), `${f}: ${n} is spent and no tool charges it`).toBe(
        true
      )
  })

  it('a file that defines tools and spends defines a priced tool', () => {
    for (const { f, n, text } of pricedSites) {
      const defined = [...text.matchAll(/\bname:\s*'([a-z_0-9]+)'/g)]
        .map(m => m[1])
        .filter(x => by.has(x))
      if (defined.length === 0) continue // a helper; its caller is the tool
      expect(
        defined.some(x => priceOf(x) > 0),
        `${f} spends ${n} but every tool it defines looks free`
      ).toBe(true)
    }
  })
})
