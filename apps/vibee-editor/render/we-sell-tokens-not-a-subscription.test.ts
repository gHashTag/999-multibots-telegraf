import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { TOOLS, toMcpTools, type ToolContext } from './src/agent/tools'
import { a2aCard } from './src/agent/a2a'
import { pricingSummary } from './src/agent/pricing'
import { systemPrompt } from './src/agent/chat'
import {
  CLUB_INSIDE,
  CLUB_OFFER_WHEN,
  CLUB_PERIOD_S,
  CLUB_STARS,
  clubDescription,
  clubOffer,
  clubOfferLine,
  clubTokensPerPeriod,
  spacedNumber,
} from './src/agent/club-membership'

/**
 * TOKENS, AND ONE CLUB. NOTHING ELSE, AND NOTHING FIRST.
 *
 * The owner's decision, confirmed 2026-09-22 and said three times: the ONLY
 * subscription is the club -- 10 000 Telegram Stars per 30 days, thirty
 * percent back in tokens. Everything else is tokens. The old tiers
 * (NEUROVIDEO, NEUROPHOTO, NEUROTESTER, NEUROBLOGGER, NEUROBASE) and the old
 * BASIC / PRO / STUDIO tariffs do not exist.
 *
 * THIS FILE USED TO SAY THE OPPOSITE, AND THAT IS WHY IT WAS REWRITTEN. It was
 * written on 2026-09-08 for "we sell tokens and nothing else", and it pinned
 * the sentence "there is no club" into the `pricing` tool. On 2026-09-09 the
 * owner priced the club; the prompt moved, the pricing tool did not, and this
 * test held it where it was. Measured 2026-09-22: in thirty days the agent
 * never named the club's price once -- it was told by its prompt to sell the
 * club and to call `pricing`, and `pricing` told it the club did not exist.
 *
 * What the file pins now, each rule with its own test:
 *   1. No invented offer anywhere the agent speaks: no dollar club, no
 *      NEURO* tier, no BASIC/PRO/STUDIO, no price per month.
 *   2. Nothing says the club does not exist, and wherever the club is named
 *      it is named with its real price, read from the constants the invoice
 *      charges by.
 *   3. The club is never offered first: the prompt says when (a price, a
 *      purchase, the club or the twin), and the client in the owner's DM is
 *      not sold it at all.
 *
 * `toMcpTools` copies every tool description into /.well-known/agent-card.json,
 * which auth.ts serves to anyone without a credential -- so what the tools say
 * about money is published to strangers, and the card gets its own test.
 */

/** Offers that do not exist. Each is proven against real shipped copy below. */
const INVENTED: ReadonlyArray<readonly [string, RegExp]> = [
  ['dollar club $99', /\$\s?99(?![\d.])/],
  ['dollar club $999', /\$\s?999(?![\d.])/],
  ['Trinity Club', /trinity club/i],
  ['club tariffs', /тарифы клуба/i], // cyrillic-ok: needle
  ['a NEURO* tier', /\bNEURO(VIDEO|PHOTO|TESTER|BLOGGER|BASE)\b/i],
  ['a BASIC / PRO / STUDIO tariff', /\b(BASIC|PRO|STUDIO|Basic)\b/],
  ['a price per month', /\/\s?мес/i], // cyrillic-ok: needle
]

/**
 * Sentences that deny the club. The last one looks behind: "no OTHER tariffs
 * or subscriptions" is the truth and must pass, "no tariffs or subscriptions"
 * is the old lie and must not.
 */
const DENIALS: readonly RegExp[] = [
  /клуба\s+нет/i, // cyrillic-ok: needle
  /тарифов,\s*подписок\s+и\s+клуба/i, // cyrillic-ok: needle
  /(?<!других\s)тарифов\s+и\s+подписок\s+нет/i, // cyrillic-ok: needle
]

function invented(text: string): string[] {
  return INVENTED.filter(([, re]) => re.test(text)).map(([name]) => name)
}

function denies(text: string): boolean {
  return DENIALS.some(re => re.test(text))
}

/** The price as every surface must spell it: from the constant, not a literal. */
const PRICE = `${spacedNumber(CLUB_STARS)} звёзд за ${CLUB_PERIOD_S / 86_400} дней` // cyrillic-ok: expected copy
const BACK = spacedNumber(clubTokensPerPeriod())

/**
 * A ToolContext that answers only what the pricing tool is allowed to read.
 * Any other property -- a pool, a telegram id, a method nobody declared --
 * throws, so a handler that starts reaching into the database or the person's
 * identity to decide a price list fails here instead of passing quietly.
 */
function strictCtx(surface: string | undefined): ToolContext {
  const allowed: Record<string, unknown> = { surface }
  return new Proxy({} as ToolContext, {
    get(_t, key) {
      if (typeof key === 'string' && key in allowed) return allowed[key]
      throw new Error(`pricing read ctx.${String(key)}, which it must not need`)
    },
  })
}

function pricingTool() {
  const t = TOOLS.find(x => x.name === 'pricing')
  if (!t) throw new Error('the pricing tool is gone')
  return t
}

describe('the needles are real', () => {
  /**
   * SELF-CHECK. Every needle fires on copy that actually shipped, so "no
   * offences" cannot mean "the matcher looked for nothing". And none fires on
   * the club as it is sold today, so a green run is not a matcher that the
   * real offer would also trip.
   */
  it('each invented-offer needle catches the copy it was written for', () => {
    // The agent's old `club` tool description and price entry (2026-09-08).
    const oldTool =
      'Тарифы клуба Trinity S³AI: Basic $99/мес (доступ к харнесу) и Pro $999/мес' // cyrillic-ok: shipped copy
    const oldEntry = "название: 'Trinity Club — Basic', цена: '$99/мес'" // cyrillic-ok: shipped copy
    // The bot's tariff tables, src/price/priceCalculator.ts.
    const tiers =
      "{ amount: 699, stars: '304', subscription: SubscriptionType.PRO }\n" +
      "{ amount: 2999, stars: '1303', subscription: SubscriptionType.NEUROVIDEO }"
    const seen = new Set([
      ...invented(oldTool),
      ...invented(oldEntry),
      ...invented(tiers),
    ])
    expect([...seen].sort()).toEqual(INVENTED.map(([n]) => n).sort())
  })

  it('each denial needle catches a denial that shipped, and not the truth', () => {
    // pricing.ts, tools.ts `pricing` and tools.ts `tokens_invoice`, as merged.
    expect(
      denies(
        'Тарифов, подписок и клуба нет; провайдеров держим мы' // cyrillic-ok: shipped copy
      )
    ).toBe(true)
    expect(
      denies('Тарифов, подписок и клуба НЕТ — есть баланс токенов') // cyrillic-ok: shipped copy
    ).toBe(true)
    expect(denies('Тарифов и подписок нет — есть только токены.')).toBe(true) // cyrillic-ok: shipped copy
    expect(denies('Других тарифов и подписок нет.')).toBe(false) // cyrillic-ok: the truth
  })

  it('the club as sold today trips nothing', () => {
    expect(invented(clubOfferLine())).toEqual([])
    expect(denies(clubOfferLine())).toBe(false)
    expect(invented(JSON.stringify(clubOffer()))).toEqual([])
  })
})

describe('one source for the club offer', () => {
  it('the offer is the constants the invoice charges by, not typed numbers', () => {
    const o = clubOffer()
    expect(o.stars).toBe(CLUB_STARS)
    expect(o.stars).toBe(10_000)
    expect(o.periodDays).toBe(30)
    expect(o.back).toBe(clubTokensPerPeriod())
    expect(o.back).toBe(2571)
    expect(o.sharePercent).toBe(30)
    expect(clubOfferLine()).toContain(PRICE)
    expect(clubOfferLine()).toContain(`(${BACK})`)
  })

  it('the invoice and the offer describe the same product', () => {
    expect(clubDescription().toLowerCase()).toContain(CLUB_INSIDE)
    expect(clubOfferLine()).toContain(CLUB_INSIDE)
  })

  it('the pricing tool, its description and the prompt all carry that one line', () => {
    expect(pricingTool().description).toContain(clubOfferLine())
    const club = (pricingSummary('bot') as Record<string, any>)['клуб'] // cyrillic-ok: field name
    expect(club?.что).toBe(CLUB_INSIDE) // cyrillic-ok: field name
    expect(club?.цена).toContain(spacedNumber(CLUB_STARS)) // cyrillic-ok: field name
    expect(club?.возврат).toContain(BACK) // cyrillic-ok: field name
    for (const surface of ['bot', 'app']) {
      expect(systemPrompt(surface), surface).toContain(clubOfferLine())
    }
  })
})

describe('no invented offer and no denial, wherever the agent speaks', () => {
  it('no tool is named club, and no tool offers or denies anything false', () => {
    expect(TOOLS.map(t => t.name)).not.toContain('club')
    for (const t of TOOLS) {
      const text = t.description + JSON.stringify(t.parameters)
      expect(invented(text), `tool ${t.name}`).toEqual([])
      expect(denies(text), `tool ${t.name}`).toBe(false)
    }
  })

  /**
   * The card is the one surface an unauthenticated stranger reads. What it
   * says about money must be true: no invented plan, no "there is no club",
   * and the club with the price the invoice actually asks for.
   */
  it('the public agent card tells the truth about money', () => {
    const card = a2aCard('https://example.invalid')
    const text = JSON.stringify(card)
    expect(invented(text)).toEqual([])
    expect(denies(text)).toBe(false)
    expect(text).not.toContain('"club"')
    expect(JSON.stringify(toMcpTools())).not.toContain('"club"')
    const pricing = card.skills.find(s => s.id === 'pricing')
    expect(pricing?.description).toContain(clubOfferLine())
  })

  it('the price list names the club with its price and says how to pay', () => {
    for (const surface of ['bot', 'app', undefined]) {
      const summary = pricingSummary(surface) as Record<string, unknown>
      const text = JSON.stringify(summary)
      expect(invented(text), String(surface)).toEqual([])
      expect(denies(text), String(surface)).toBe(false)
      expect(Object.keys(summary)).toContain('клуб') // cyrillic-ok: field name
      expect(text).toContain(PRICE.replace(' звёзд', ' ⭐')) // cyrillic-ok: expected copy
      expect(text).toContain('tokens_invoice')
    }
  })

  it('every surface of the prompt sells tokens and invents nothing', () => {
    for (const surface of ['bot', 'business', 'app']) {
      const p = systemPrompt(surface)
      expect(invented(p), surface).toEqual([])
      expect(denies(p), surface).toBe(false)
      expect(p, surface).toContain('tokens_invoice')
    }
  })
})

describe('the club is never offered first', () => {
  it('the creator prompt says when the club may be named, and forbids leading with money', () => {
    for (const surface of ['bot', 'app']) {
      const p = systemPrompt(surface)
      expect(p, surface).toContain(CLUB_OFFER_WHEN)
      expect(p, surface).toContain('НЕ ПРЕДЛАГАЙ ОПЛАТУ ПЕРВЫМ') // cyrillic-ok: prompt copy
    }
    // The rule names the three triggers and says "not first" in words.
    expect(CLUB_OFFER_WHEN).toMatch(/цене/) // cyrillic-ok: trigger
    expect(CLUB_OFFER_WHEN).toMatch(/покупке/) // cyrillic-ok: trigger
    expect(CLUB_OFFER_WHEN).toMatch(/двойнике/) // cyrillic-ok: trigger
    expect(CLUB_OFFER_WHEN).toMatch(/первым не предлагай/) // cyrillic-ok: rule
  })

  it('the price list carries the same rule next to the offer', () => {
    const club = (pricingSummary('bot') as Record<string, any>)['клуб'] // cyrillic-ok: field name
    expect(club?.когда_называть).toBe(CLUB_OFFER_WHEN) // cyrillic-ok: field name
  })

  /**
   * The client in the owner's DM buys pictures, not a twin. The club is not
   * sold there -- the DM prompt already said so -- and the price list the DM
   * agent reads must not hand it the offer the prompt withholds.
   */
  it('the client in the owner DM is not sold the club, by the prompt or by pricing', () => {
    const p = systemPrompt('business')
    expect(p).not.toContain(clubOfferLine())
    expect(p).not.toContain(spacedNumber(CLUB_STARS))
    expect(p).toContain('НЕ ПРЕДЛАГАЙ ОПЛАТУ САМ') // cyrillic-ok: prompt copy
    const dm = pricingSummary('business') as Record<string, unknown>
    expect(Object.keys(dm)).not.toContain('клуб') // cyrillic-ok: field name
    expect(JSON.stringify(dm)).not.toContain(spacedNumber(CLUB_STARS))
  })

  it('the pricing tool reads the caller surface and nothing else', async () => {
    const tool = pricingTool()
    const dm = (await tool.handler({}, strictCtx('business'))) as Record<
      string,
      unknown
    >
    const bot = (await tool.handler({}, strictCtx('bot'))) as Record<
      string,
      unknown
    >
    expect(Object.keys(dm)).not.toContain('клуб') // cyrillic-ok: field name
    expect(Object.keys(bot)).toContain('клуб') // cyrillic-ok: field name
  })

  it('the strict context really refuses what it was not given', () => {
    expect(() => strictCtx('bot').pool).toThrow(/must not need/)
    expect(() => strictCtx('bot').telegramId).toThrow(/must not need/)
  })
})

/**
 * A file census on top of the behavioural checks: the tests above read the
 * registry through its own exports, so an invented plan re-introduced in a
 * module they do not happen to load would pass them. This reads the directory.
 */
describe('the agent module carries no invented plan and no second copy of the club', () => {
  const dir = join(__dirname, 'src', 'agent')
  const sources = () =>
    readdirSync(dir)
      .filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts'))
      .map(f => ({ f, text: readFileSync(join(dir, f), 'utf8') }))

  it('the census can see a file it is meant to catch', () => {
    expect(invented("цена: '$99/мес'")).toEqual([
      'dollar club $99',
      'a price per month',
    ])
  })

  it('no file under src/agent offers a monthly plan or a dead tier', () => {
    const files = sources()
    expect(files.length).toBeGreaterThan(10)
    const guilty = files
      .filter(({ text }) => invented(text).length)
      .map(({ f, text }) => `${f}: ${invented(text).join(', ')}`)
    expect(guilty).toEqual([])
  })

  it('no file under src/agent denies the club', () => {
    const guilty = sources()
      .filter(({ text }) => denies(text))
      .map(({ f }) => f)
    expect(guilty).toEqual([])
  })

  /**
   * The club's price typed out by hand in a second place is how the two
   * weeks of contradiction began. Code outside club-membership.ts may name
   * the club only through its exports.
   */
  it('the club price is typed in one file only', () => {
    const typed = /10\s?000\s*(звёзд|⭐)|2\s?571/ // cyrillic-ok: needle
    expect(typed.test('10 000 звёзд за 30 дней')).toBe(true) // cyrillic-ok: self-check
    const guilty = sources()
      .filter(({ f }) => f !== 'club-membership.ts')
      .filter(({ text }) =>
        // Comments are history, not copy the agent reads.
        typed.test(
          text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
        )
      )
      .map(({ f }) => f)
    expect(guilty).toEqual([])
  })
})
