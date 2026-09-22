/**
 * NO VIDEO IS SOLD BELOW WHAT IT COSTS US, TIMES THE MARKUP.
 *
 * Measured 2026-09-22, before this file: the agent's `video_generate` and the
 * web's default video tab sold a Replicate seedance-1-lite clip at a flat 40
 * tokens -- $0.20 at the billing base -- for a 5- or 10-second clip the
 * provider bills $0.18 or $0.36 at 720p. And five Kie video models billed per
 * second, whose length the provider picks, were charged ONE second
 * (bytedance/seedance-2: 23 tokens for a clip billed at least five seconds).
 *
 * Every check here runs the real pricing code; the charge is run against an
 * in-memory wallet that reads the statement it is given, so "refused" means
 * the balance did not move, not that a helper returned a string.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import {
  COST_PER_TOKEN_USD,
  НАЦЕНКА, // cyrillic-ok: the owner's markup constant
  TOKEN_PRICES,
  REPLICATE_VIDEO_LENGTHS,
  REPLICATE_VIDEO_RESOLUTION,
  REPLICATE_VIDEO_USD_PER_SECOND,
  replicateVideoSeconds,
  replicateClipModel,
  replicateClipCostUsd,
  replicateClipTokens,
  replicateClipPrices,
  kieVideoSale,
  kieVideoSaleOf,
  kieVideoQuote,
  isKieVideoModel,
  isExplicitKieVideo,
  videoChargeLength,
  videoChargeUnits,
  priceForKieModel,
  priceForModel,
  модельныеЦены, // cyrillic-ok: existing export
  spendByTid,
  refundByTid,
} from './src/agent/billing-shared'
import { KIE_WEB_MODELS } from './src/agent/kie-web-provider'
import { СЕБЕСТОИМОСТЬ_USD } from './src/agent/kie-prices.generated' // cyrillic-ok: generated table

const MARKUP = НАЦЕНКА // cyrillic-ok: the owner's markup constant
const modelPrices = модельныеЦены // cyrillic-ok: existing export
const KIE_COST = СЕБЕСТОИМОСТЬ_USD // cyrillic-ok: generated table

/** What `tokens` covers at the provider while keeping the owner's markup. */
const covers = (tokens: number) => (tokens * COST_PER_TOKEN_USD) / MARKUP

/** Invented ids (9000000xx): no real person in the repository. */
const BUYER = '900000071'

/**
 * A wallet that answers the statements the ledger sends, by reading them:
 * the debit is refused when `balance >= $2` is false, exactly as Postgres
 * would. Anything it does not recognise answers with no rows.
 */
function wallet(start: number) {
  let balance = start
  let ledgerId = 0
  const debits: number[] = []
  const credits: number[] = []
  const pool = {
    query: async (sql: string, params: unknown[] = []) => {
      const q = sql.replace(/\s+/g, ' ')
      if (/SELECT balance FROM user_tokens/i.test(q))
        return { rows: [{ balance }] }
      if (/SET balance = balance - \$2/i.test(q)) {
        const amount = Number(params[1])
        if (/balance >= \$2/i.test(q) && balance < amount) return { rows: [] }
        balance -= amount
        debits.push(amount)
        return { rows: [{ balance }] }
      }
      if (/SET balance = balance \+ \$2/i.test(q)) {
        balance += Number(params[1])
        credits.push(Number(params[1]))
        return { rows: [{ balance }] }
      }
      if (/INSERT INTO token_ledger/i.test(q))
        return { rows: [{ id: ++ledgerId }] }
      return { rows: [] }
    },
  }
  return { pool, debits, credits, balance: () => balance }
}

describe('the Replicate clip is priced by its length', () => {
  it('every length is sold at or above cost x markup, and never below the video price', () => {
    for (const s of REPLICATE_VIDEO_LENGTHS) {
      const price = replicateClipTokens(s)
      expect(covers(price), `${s} s`).toBeGreaterThanOrEqual(
        replicateClipCostUsd(s)
      )
      expect(price, `${s} s`).toBeGreaterThanOrEqual(
        TOKEN_PRICES.video_generate
      )
    }
    // Length is priced, not ignored: the long clip costs more than the short.
    expect(replicateClipTokens(10)).toBeGreaterThan(replicateClipTokens(5))
  })

  it("today's numbers, from the provider's page: $0.036/s at 720p", () => {
    // The page price and the quality are what the numbers below rest on.
    expect(REPLICATE_VIDEO_USD_PER_SECOND).toBe(0.036)
    expect(REPLICATE_VIDEO_RESOLUTION).toBe('720p')
    expect(replicateClipPrices()).toEqual({ '5': 72, '10': 144 })
    // The flat price is gone: 40 covered $0.10, below both clips' cost.
    expect(TOKEN_PRICES.video_generate).toBe(72)
  })

  it('the length ordered is the length the charge priced', () => {
    for (const five of [undefined, null, '', 'abc', 0, 5, '5s', 7, '7.9'])
      expect(replicateVideoSeconds(five), String(five)).toBe(5)
    for (const ten of [8, 10, '10s', '10', 12, 60])
      expect(replicateVideoSeconds(ten), String(ten)).toBe(10)
  })

  it('each length has its own model id, and the charge reads its price', () => {
    const ids = REPLICATE_VIDEO_LENGTHS.map(replicateClipModel)
    expect(new Set(ids).size).toBe(REPLICATE_VIDEO_LENGTHS.length)
    for (const s of REPLICATE_VIDEO_LENGTHS) {
      expect(priceForModel('video_generate', replicateClipModel(s))).toBe(
        replicateClipTokens(s)
      )
      // The clip is a video: no other operation may sell it.
      expect(priceForModel('image_generate', replicateClipModel(s))).toBeNull()
    }
  })
})

describe('which Kie videos can be sold at all', () => {
  const clip = { cost: 0.3, unit: 'за ролик', needs: ['prompt'] }
  it('refuses a per-second video whose length the provider picks', () => {
    const r = kieVideoSale({
      cost: 0.057,
      unit: 'за секунду',
      needs: ['prompt'],
    })
    expect(r.sold).toBe(false)
  })
  it('sells per second when the chip reaches the provider, or the file sets it', () => {
    expect(
      kieVideoSale({
        cost: 0.09,
        unit: 'за секунду',
        needs: ['prompt', 'duration'],
      })
    ).toEqual({ sold: true, per: 'second', length: 'person' })
    expect(
      kieVideoSale({ cost: 0.04, unit: 'за секунду', needs: ['video_url'] })
    ).toEqual({ sold: true, per: 'second', length: 'file' })
  })
  it('sells a clip priced per clip', () => {
    expect(kieVideoSale(clip)).toEqual({
      sold: true,
      per: 'clip',
      length: null,
    })
  })
  it('refuses a unit that does not price a clip, and a missing price', () => {
    for (const unit of ['за картинку', 'за запрос', null, undefined])
      expect(kieVideoSale({ ...clip, unit }).sold, String(unit)).toBe(false)
    for (const cost of [null, undefined, NaN])
      expect(kieVideoSale({ ...clip, cost }).sold, String(cost)).toBe(false)
  })
})

describe('every catalogued Kie video: sold means covered, refused means unpriced', () => {
  const videos = Object.keys(KIE_COST).filter(isKieVideoModel)
  const sold = videos.filter(id => kieVideoSaleOf(id).sold)
  const refused = videos.filter(id => !kieVideoSaleOf(id).sold)

  it('both sides are populated, and the case that lost money is refused', () => {
    // Denominators: a rule that sells nothing or refuses nothing proves nothing.
    expect(sold.length).toBeGreaterThanOrEqual(3)
    expect(refused.length).toBeGreaterThanOrEqual(3)
    expect(refused).toContain('bytedance/seedance-2')
    expect(refused).toContain('grok-imagine/text-to-video')
    expect(sold).toContain('kling/v3-turbo-text-to-video')
  })

  it('a sold video: the charge is the floor, and the floor covers cost x markup', () => {
    for (const id of sold) {
      const sale = kieVideoSaleOf(id)
      if (!sale.sold) throw new Error(id)
      // The route's own grid: the chip is 6 or 10 s, a file up to 60 s.
      const lengths =
        sale.per === 'clip'
          ? [1]
          : sale.length === 'person'
            ? [6, 10]
            : [1, 7, 60]
      for (const n of lengths) {
        const quote = kieVideoQuote(id, n)
        if ('refused' in quote) throw new Error(`${id}: ${quote.refused}`)
        // What spendByTid takes: the model's unit price times the units.
        expect(quote.tokens, `${id} x${n}`).toBe(priceForKieModel(id)! * n)
        expect(covers(quote.tokens), `${id} x${n}`).toBeGreaterThanOrEqual(
          quote.costUsd
        )
      }
    }
  })

  it('a refused video has no price anywhere a client or the charge reads one', () => {
    const shown = modelPrices()
    for (const id of refused) {
      expect(priceForKieModel(id), id).toBeNull()
      expect(shown[`kie/${id}`], id).toBeUndefined()
      expect(priceForModel('video_generate', `kie/${id}`), id).toBeNull()
      expect(KIE_WEB_MODELS.video.has(id), id).toBe(false)
      expect('refused' in kieVideoQuote(id, 10), id).toBe(true)
    }
  })
})

describe('the charge itself', () => {
  it('a refused Kie video moves nothing, whatever the balance', async () => {
    const w = wallet(1000)
    const r = await spendByTid(
      w.pool as never,
      BUYER,
      'video_generate',
      1,
      'kie/bytedance/seedance-2'
    )
    expect(r.ok).toBe(false)
    expect(w.debits).toEqual([])
    expect(w.balance()).toBe(1000)
  })

  it('a Replicate clip is charged its length, and refunded exactly that', async () => {
    for (const s of REPLICATE_VIDEO_LENGTHS) {
      const w = wallet(1000)
      const r = await spendByTid(
        w.pool as never,
        BUYER,
        'video_generate',
        1,
        replicateClipModel(s)
      )
      expect(r.ok, `${s} s`).toBe(true)
      expect(w.debits, `${s} s`).toEqual([replicateClipTokens(s)])
      // No receipt handed back: the refund re-reads the same price.
      const back = await refundByTid(
        w.pool as never,
        BUYER,
        'video_generate',
        1,
        replicateClipModel(s)
      )
      expect(back, `${s} s`).toEqual({
        ok: true,
        refunded: replicateClipTokens(s),
      })
      expect(w.balance(), `${s} s`).toBe(1000)
    }
  })

  it('a clip the balance cannot cover is refused, not cut to what is left', async () => {
    const w = wallet(100)
    const r = await spendByTid(
      w.pool as never,
      BUYER,
      'video_generate',
      1,
      replicateClipModel(10)
    )
    expect(r.ok).toBe(false)
    expect(w.balance()).toBe(100)
  })
})

describe('the leg that runs decides what one press is charged for', () => {
  /*
   * A bare per-second Kie id (no `kie/`) goes down the Replicate leg and buys
   * ONE seedance clip. The route used to ask the per-second check about the
   * bare id and multiply the clip's price by the chip: 1440 tokens for a
   * 10-second clip priced 144. These are the ids that did it, and the one
   * that measured its file before the charge.
   */
  const BARE_PER_SECOND = [
    ['kling/v3-turbo-text-to-video', 10],
    ['minimax-h3/text-to-video', 5],
    ['topaz/video-upscale', 10],
  ] as const

  it('the ids are per-second Kie videos, sold as such under their prefix', () => {
    // Without this the cases below would pass on ids that are not the risk.
    for (const [id] of BARE_PER_SECOND) {
      const sale = kieVideoSaleOf(`kie/${id}`)
      expect(sale, id).toMatchObject({ sold: true, per: 'second' })
      expect(isExplicitKieVideo(id), id).toBe(false)
      expect(isExplicitKieVideo(`kie/${id}`), id).toBe(true)
    }
  })

  it('a bare id is one Replicate clip: quantity 1, charged the clip price', async () => {
    for (const [id, asked] of BARE_PER_SECOND) {
      const rule = videoChargeLength(id)
      expect(rule, id).toBe('clip')
      // The route passes its chip (6 or 10) and no measurement; neither counts.
      const units = videoChargeUnits(rule, asked <= 6 ? 6 : 10)
      expect(units, id).toBe(1)
      const clip = replicateVideoSeconds(asked)
      const w = wallet(10_000)
      const spent = await spendByTid(
        w.pool as never,
        BUYER,
        'video_generate',
        units,
        replicateClipModel(clip)
      )
      expect(spent.ok, id).toBe(true)
      expect(w.debits, id).toEqual([replicateClipTokens(clip)])
    }
  })

  it('no model, a garbage model and a Replicate id are one clip too', () => {
    for (const model of [undefined, null, 42, '', 'seedance', 'kling-pro'])
      expect(
        videoChargeUnits(videoChargeLength(model), 10),
        String(model)
      ).toBe(1)
  })

  it('the same ids with the prefix are charged by their unit', () => {
    expect(videoChargeLength('kie/kling/v3-turbo-text-to-video')).toBe('person')
    expect(videoChargeUnits('person', 10)).toBe(10)
    expect(videoChargeLength('kie/topaz/video-upscale')).toBe('file')
    expect(videoChargeUnits('file', 10, 12.2)).toBe(13)
    // A file that was not measured is refused, not charged one second.
    expect(() => videoChargeUnits('file', 10)).toThrow()
    expect(() => videoChargeUnits('file', 10, 0)).toThrow()
    // A per-clip Kie video is one unit, whatever the chip says.
    const perClip = Object.keys(KIE_COST).find(id => {
      const sale = kieVideoSaleOf(id)
      return isKieVideoModel(id) && sale.sold && sale.per === 'clip'
    })
    expect(perClip).toBeDefined()
    expect(videoChargeLength(`kie/${perClip}`)).toBe('clip')
  })
})

describe('the route orders what it charged', () => {
  /*
   * The route is one handler inside a createServer the size of a small
   * program; it is read here as text, the way billing-prices.test.ts reads
   * it. What is held: the refusal comes before the charge, the charge names
   * the model its price belongs to, every refund names the same one, and the
   * Replicate call orders the length that was paid for.
   */
  const server = fs.readFileSync(
    path.join(__dirname, 'render-server.ts'),
    'utf8'
  )
  const start = server.indexOf("req.url === '/api/generate/video'")
  const end = server.indexOf('GET /api/balance', start)
  const route = server.slice(start, end)
  // The route's names for the charged quantity and the chip, as written there.
  const QTY = 'секунды'
  const CHIP = 'длинаРолика'

  it('the slice is the video route', () => {
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    expect(route).toContain('generateVideoViaReplicate(')
  })

  it('a Kie model the floor refuses is answered before any charge', () => {
    const refusal = route.indexOf('kieVideoSaleOf(model)')
    const charge = route.indexOf('chargeMiniAppUser(')
    expect(refusal).toBeGreaterThan(-1)
    expect(charge).toBeGreaterThan(refusal)
    // The refusal answers and returns; it does not fall through to a charge.
    expect(route.slice(refusal, charge)).toMatch(
      /if \(!sale\.sold\) \{[\s\S]{0,400}?res\.writeHead\(400[\s\S]{0,400}?return\s*\}/
    )
  })

  it('the Replicate leg is priced and ordered by one length', () => {
    expect(route).toMatch(/clipSeconds = replicateVideoSeconds\(duration\)/)
    expect(route).toMatch(/billedModel = replicateClipModel\(clipSeconds\)/)
    // The quantity is the route's one counted variable, not any expression.
    expect(route).toMatch(
      new RegExp(
        `chargeMiniAppUser\\(\\s*req,\\s*'video_generate',\\s*${QTY},\\s*billedModel\\s*\\)`
      )
    )
    // The fallback orders the paid length, not a second reading of the body.
    expect(route).toMatch(
      /generateVideoViaReplicate\(\s*String\(b\.prompt \|\| ''\),[\s\S]{0,120}?clipSeconds,/
    )
    // And the helper sends exactly that length at the resolution it was priced at.
    const helper = server.slice(
      server.indexOf('async function generateVideoViaReplicate('),
      server.indexOf("req.url === '/api/generate/video'")
    )
    expect(helper).toMatch(/duration: durationSec,/)
    expect(helper).toMatch(/resolution: REPLICATE_VIDEO_RESOLUTION,/)
  })

  it('the leg is picked once, and only its rule sets the quantity', () => {
    // One predicate picks the leg for the price, the quantity and the order.
    expect(route).toMatch(/const explicitKie = isExplicitKieVideo\(model\)/)
    expect(route).toMatch(
      /if \(explicitKie\) \{\s*const kieModel = reviewedKieModel\('video', model\)!/
    )
    expect(route).not.toMatch(/model\.startsWith\('kie\/'\)/)
    // The quantity has exactly two assignments: its default of one, and the
    // rule's answer. An inline override (the chip on the Replicate leg) is a
    // third and fails here.
    const assignments =
      route.match(new RegExp(`(?:let )?${QTY} = [^\\n]*`, 'g')) ?? []
    expect(assignments).toEqual([
      `let ${QTY} = 1`,
      `${QTY} = videoChargeUnits(lengthRule, ${CHIP}, measuredSeconds) // cyrillic-ok: existing variables`,
    ])
    const rule = route.indexOf('const lengthRule = videoChargeLength(model)')
    const measureIf = route.indexOf("if (lengthRule === 'file') {")
    const measure = route.indexOf('measuredRemoteDuration(')
    const charge = route.indexOf('chargeMiniAppUser(')
    expect(rule).toBeGreaterThan(-1)
    // A file is measured only on the rule's say-so, and before the charge.
    expect(measureIf).toBeGreaterThan(rule)
    expect(measure).toBeGreaterThan(measureIf)
    expect(charge).toBeGreaterThan(measure)
    expect(route.split('measuredRemoteDuration(').length - 1).toBe(1)
  })

  it('every refund gives back under the model that was charged', () => {
    const refunds = route.match(/refundMiniAppUser\([\s\S]*?\)/g) ?? []
    // The denominator: the explicit-Kie error, the MCP answer, the fallback.
    expect(refunds.length).toBeGreaterThanOrEqual(3)
    for (const call of refunds) {
      expect(call).toContain('billedModel')
      expect(call).not.toContain('requestedModel')
    }
  })
})

describe('the agent tool charges the clip it orders', () => {
  let bodies: unknown[]
  beforeEach(() => {
    bodies = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown, init?: { body?: unknown }) => {
        if (String(url).endsWith('/api/generate/video'))
          bodies.push(JSON.parse(String(init?.body ?? 'null')))
        // The provider fails fast, so the handler refunds and returns.
        return {
          ok: false,
          status: 503,
          json: async () => ({}),
          text: async () => 'down',
        }
      })
    )
  })
  afterEach(() => vi.unstubAllGlobals())

  it('10 s: charged the 10-second price and asks the route for 10 s', async () => {
    const { TOOLS } = await import('./src/agent/tools')
    const video = TOOLS.find(t => t.name === 'video_generate')!
    for (const [asked, made] of [
      [10, 10],
      [undefined, 5],
    ] as const) {
      bodies = []
      const w = wallet(1000)
      await video.handler({ prompt: 'x', duration: asked }, {
        telegramId: BUYER,
        pool: w.pool,
      } as never)
      expect(w.debits, `asked ${asked}`).toEqual([replicateClipTokens(made)])
      expect(bodies, `asked ${asked}`).toEqual([
        expect.objectContaining({ duration: made }),
      ])
    }
  }, 120_000)
})
