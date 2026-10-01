import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  PRODUCTS,
  PRICES_TTL_MS,
  daysRu,
  forgetPrices,
  productLine,
  productsBlock,
  readPrices,
  type PriceList,
} from './src/agent/product-catalog'
import { systemPrompt } from './src/agent/chat'

/**
 * Owner, 2026-10-01: a client sent t.me/leela_chakra_ai_bot to the owner's DM
 * and asked what the app costs. The agent quoted the token packs of the reels
 * app -- the only price list the DM prompt held. The shape of the defect is
 * "a product is quoted a price that is not its own", so every check below is
 * about whose price reaches which conversation, and where it comes from.
 */

const LEELA = PRODUCTS.find(p => p.bot === 'leela_chakra_ai_bot')!
const KEEPER = '144022504'
const OTHER_SELLER = '777000111'

/** Odd numbers on purpose: a line that matches them was read, not remembered. */
const LIST: PriceList = {
  currency: 'XTR',
  freeMoves: 4,
  tiers: [
    { id: 'month', days: 31, stars: 157 },
    { id: 'halfyear', days: 182, stars: 703 },
    { id: 'year', days: 365, stars: 1211 },
  ],
}

function fetchOf(body: unknown, status = 200) {
  return vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      })
  ) as unknown as typeof fetch & ReturnType<typeof vi.fn>
}

const owns = (map: Record<string, string[]>) => ({
  async botsOwnedBy(id: string) {
    return map[id] ?? []
  },
})

let keepersBefore: string | undefined
beforeEach(() => {
  forgetPrices()
  keepersBefore = process.env.HIVE_KEEPERS
  process.env.HIVE_KEEPERS = KEEPER
})
afterEach(() => {
  if (keepersBefore === undefined) delete process.env.HIVE_KEEPERS
  else process.env.HIVE_KEEPERS = keepersBefore
})

describe('the product is quoted its own price list', () => {
  it('Leela is in the catalogue, by the bot the client links to', () => {
    expect(LEELA).toBeDefined()
    expect(LEELA.pricesUrl()).toMatch(/\/api\/prices$/)
  })

  it('every tier, the free moves and where to pay come from the fetched list', async () => {
    const f = fetchOf(LIST)
    const block = await productsBlock(KEEPER, owns({}), f)
    for (const t of LIST.tiers) {
      expect(block).toContain(`${t.stars}⭐ на ${daysRu(t.days)}`) // cyrillic-ok: expected copy
    }
    expect(block).toContain(`: ${LIST.freeMoves}.`)
    expect(block).toContain('@leela_chakra_ai_bot')
    expect(block).toContain('/pro')
    expect(f).toHaveBeenCalledWith(LEELA.pricesUrl(), expect.anything())
  })

  it('the token packs are said to be for pictures, not for these products', async () => {
    const block = await productsBlock(KEEPER, owns({}), fetchOf(LIST))
    expect(block).toContain('к этим продуктам они не относятся') // cyrillic-ok: expected copy
  })

  it('a list that cannot be read is "I will check", never a number', async () => {
    const unreadable: Array<ReturnType<typeof fetchOf>> = [
      fetchOf({ error: 'down' }, 503),
      fetchOf({ currency: 'USD', freeMoves: 3, tiers: [] }),
      fetchOf({
        currency: 'XTR',
        freeMoves: 3,
        tiers: [{ id: 'm', days: 30 }],
      }),
      fetchOf('not json at all'),
      vi.fn(async () => {
        throw new Error('ECONNREFUSED')
      }) as never,
    ]
    for (const f of unreadable) {
      forgetPrices()
      const line = productLine(LEELA, await readPrices(LEELA, f))
      expect(line).toContain('цифр не называй') // cyrillic-ok: expected copy
      expect(line).not.toMatch(/\d+⭐/)
    }
  })

  it('a deployment with no prices says it is free, not a remembered price', () => {
    const line = productLine(LEELA, {
      currency: 'XTR',
      freeMoves: null,
      tiers: [],
    })
    expect(line).toContain('бесплатно') // cyrillic-ok: expected copy
    expect(line).not.toMatch(/\d+⭐/)
  })

  it('the list is read once per five minutes, then again', async () => {
    const f = fetchOf(LIST)
    await readPrices(LEELA, f, 0)
    await readPrices(LEELA, f, PRICES_TTL_MS - 1)
    expect(f).toHaveBeenCalledTimes(1)
    await readPrices(LEELA, f, PRICES_TTL_MS)
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('a failed read is not cached: the next turn tries again', async () => {
    const bad = fetchOf({}, 500)
    expect(await readPrices(LEELA, bad, 0)).toBeNull()
    const good = fetchOf(LIST)
    expect(await readPrices(LEELA, good, 1)).toEqual(LIST)
  })
})

describe('only the seller who owns the product sees it', () => {
  it('the owner of the bot sees it', async () => {
    const block = await productsBlock(
      OTHER_SELLER,
      owns({ [OTHER_SELLER]: [LEELA.bot] }),
      fetchOf(LIST)
    )
    expect(block).toContain('@leela_chakra_ai_bot')
  })

  it("another seller's client is told nothing, and nothing is fetched", async () => {
    const f = fetchOf(LIST)
    const block = await productsBlock(
      OTHER_SELLER,
      owns({ [OTHER_SELLER]: ['neuro_blogger_bot'] }),
      f
    )
    expect(block).toBe('')
    expect(f).not.toHaveBeenCalled()
  })

  it('an ownership lookup that fails shows nothing', async () => {
    const block = await productsBlock(
      OTHER_SELLER,
      {
        async botsOwnedBy() {
          throw new Error('avatars replied 500')
        },
      },
      fetchOf(LIST)
    )
    expect(block).toBe('')
  })

  it('no seller, no products: a keeper is not assumed', async () => {
    expect(await productsBlock(undefined, owns({}), fetchOf(LIST))).toBe('')
    expect(await productsBlock('', owns({}), fetchOf(LIST))).toBe('')
  })
})

describe('the DM prompt sends other products to that block', () => {
  it('the business prompt names the block and forbids guessing', () => {
    const p = systemPrompt('business')
    expect(p).toContain('ПРОДУКТЫ ВЛАДЕЛЬЦА') // cyrillic-ok: prompt copy
    expect(p).toContain('цифр не называй') // cyrillic-ok: prompt copy
  })
})

describe('the day word', () => {
  it('agrees with the Russian plural rules for every count up to 400', () => {
    const rules = new Intl.PluralRules('ru')
    const word = { one: 'день', few: 'дня', many: 'дней' } as const // cyrillic-ok: plural forms
    for (let n = 1; n <= 400; n++) {
      const form = rules.select(n) as keyof typeof word
      expect(daysRu(n)).toBe(`${n} ${word[form]}`)
    }
  })
})
