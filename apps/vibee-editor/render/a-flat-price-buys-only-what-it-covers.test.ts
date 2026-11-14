/**
 * A TOOL SOLD AT ONE PRICE BUYS ONLY WHAT THAT PRICE COVERS.
 *
 * `image_generate` charges one price (2 tokens then, 8 since it covers Kie
 * nano-banana, agent-media-kie.t27), whatever the caller names in `model`. The handler forwarded that name to our own
 * /api/generate/* with the agent key; the route skips its own charge for that
 * key and sends `kie/<id>` to its explicit Kie branch. So the agent chat and
 * /mcp could buy kie/google/imagen4-ultra ($0.06) for what covers $0.005, and
 * a 10-second kie/kling/v3-turbo clip ($0.90) for what covers $0.10.
 *
 * VIDEO CHANGED SIDES (2026-10-09, #3920). `video_generate` no longer has one
 * price: it orders on Kie and charges each model the app's own
 * `priceForModel` (no-video-below-cost.test.ts pins the arithmetic). What it
 * must still never do is buy a Kie model whose bill is NOT named before the
 * press -- that is the video half of the real-handler checks below.
 *
 * TWO KINDS OF CHECK. The pure refusals over every enabled Kie model, so a
 * model added to the catalogue tomorrow is covered without a new line here;
 * and the REAL handlers against a recording pool and a recording fetch, so
 * "refused" means the wallet did not move and the route was never asked --
 * not merely that a helper returns a string nobody reads.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  imageModelRefusal,
  videoModelRefusal,
} from './src/agent/flat-price-model'
import { FAL_IMAGE_MODELS } from './src/image-chain'
import { KIE_WEB_MODELS } from './src/agent/kie-web-provider'
import {
  costCeilingUsd,
  kieVideoSaleOf,
  priceForModel,
  TOKEN_PRICES,
} from './src/agent/billing-shared'
import { СЕБЕСТОИМОСТЬ_USD } from './src/agent/kie-prices.generated' // cyrillic-ok: generated table name

/*
 * Budget for a test that reaches ./tools or ./routes itself (#3750, #3764).
 * That import is CPU-bound -- ~1.5-2.3 s cold on an idle machine, 4.4-5.0 s
 * at load ~25 -- and is free only when an earlier test already paid it. Run
 * alone (`-t`, a reorder) the test pays it under vitest's 5 s default.
 */
const SLOW_IMPORT_TIMEOUT_MS = 30_000

/** Invented id (9000000xx): no real person in the repository. */
const CALLER = '900000031'

describe('which models the flat price takes', () => {
  it('image: no model, or one of the FAL endpoints the priced chain knows', () => {
    for (const none of [undefined, null, ''])
      expect(imageModelRefusal(none), String(none)).toBeNull()
    for (const fal of FAL_IMAGE_MODELS)
      expect(imageModelRefusal(fal), fal).toBeNull()
  })

  it('image: every enabled Kie model is refused, and the stake is real', () => {
    const ids = [...KIE_WEB_MODELS.image]
    // The denominator: an empty catalogue would make the loop below vacuous.
    expect(ids.length).toBeGreaterThan(5)
    for (const id of ids)
      expect(imageModelRefusal(`kie/${id}`), id).toMatch(/Ничего не списано/) // cyrillic-ok: refusal copy
    // Why this matters, from the same tables the charge uses: at least one
    // of those models costs more than the flat price covers. (The ratio was
    // above 5 while the price was 2 tokens; at 8 it covers Kie nano-banana,
    // $0.02, and the stake is the dearer models -- imagen4-ultra at $0.06.)
    const ceiling = costCeilingUsd('image_generate')
    const dearest = Math.max(...ids.map(id => СЕБЕСТОИМОСТЬ_USD[id] ?? 0)) // cyrillic-ok: generated table name
    expect(dearest).toBeGreaterThan(ceiling)
    const dearer = ids.filter(id => (СЕБЕСТОИМОСТЬ_USD[id] ?? 0) > ceiling) // cyrillic-ok: generated table name
    expect(dearer).toContain('google/imagen4-ultra')
  })

  it('image: an allow-list, so a name nobody listed is refused too', () => {
    for (const other of ['nobody/knows-this', 'KIE/google/imagen4', 42, {}])
      expect(imageModelRefusal(other), String(other)).not.toBeNull()
  })

  // The two video checks below pin `videoModelRefusal` itself. Since
  // agent-media-kie.t27 the agent tool no longer calls it (it orders through
  // videoOrder); the real-handler checks further down are what bind the tool.
  it('video: every enabled Kie model is refused, whatever its spelling', () => {
    const ids = [...KIE_WEB_MODELS.video]
    expect(ids.length).toBeGreaterThan(5)
    for (const id of ids) {
      expect(videoModelRefusal(`kie/${id}`), id).not.toBeNull()
      expect(videoModelRefusal(` KIE/${id}`), id).not.toBeNull()
    }
    const ceiling = costCeilingUsd('video_generate')
    const dearest = Math.max(...ids.map(id => СЕБЕСТОИМОСТЬ_USD[id] ?? 0)) // cyrillic-ok: generated table name
    expect(dearest).toBeGreaterThan(ceiling)
  })

  it('video: a name that is not Kie still ends at the priced Replicate leg', () => {
    for (const ok of [undefined, null, '', 'kling-v1-6 pro', 42])
      expect(videoModelRefusal(ok), String(ok)).toBeNull()
  })
})

describe('the real handlers: refused means not charged and not asked', () => {
  /** Every SQL the handler sends; answers like a wallet with 50 tokens. */
  const recordingPool = () => {
    const sqls: string[] = []
    return {
      sqls,
      query: async (sql: string) => {
        sqls.push(sql.replace(/\s+/g, ' ').trim())
        return { rows: [{ balance: 50, n: 0, count: 0 }], rowCount: 1 }
      },
    }
  }
  const charged = (sqls: string[]) =>
    sqls.filter(q => /balance = balance - /i.test(q))

  /** Every call to fetch, with the JSON body it carried. */
  let calls: { url: string; body: unknown }[]
  beforeEach(() => {
    calls = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown, init?: { body?: unknown }) => {
        let body: unknown = null
        try {
          body = JSON.parse(String(init?.body ?? 'null'))
        } catch {
          body = init?.body ?? null
        }
        calls.push({ url: String(url), body })
        // The provider "fails" fast, so a charged path refunds and returns.
        return {
          ok: false,
          status: 503,
          json: async () => ({}),
          text: async () => 'down',
        }
      })
    )
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const tool = async (name: string) => {
    const { TOOLS } = await import('./src/agent/tools')
    const t = TOOLS.find(x => x.name === name)
    expect(t, name).toBeDefined()
    return t!
  }

  it(
    'image_generate with a Kie model: its OWN price, never the flat one (#3924)',
    async () => {
      const gen = await tool('image_generate')
      // A Kie model with a named price is sold at that price
      // (agent-neuro-kie.t27 may_order_image) -- the flat price never buys it.
      const model = 'kie/google/imagen4-ultra'
      const own = priceForModel('image_generate', model)
      expect(typeof own === 'number' && own > TOKEN_PRICES.image_generate).toBe(
        true
      )
      const pool = recordingPool()
      await gen.handler(
        { prompt: 'кот', model }, // cyrillic-ok: test input
        { telegramId: CALLER, pool } as never
      )
      // One debit, for the model (its sum is pinned in
      // src/spec/agent-neuro-kie.test.ts against priceForModel).
      expect(charged(pool.sqls), 'the wallet moved once').toHaveLength(1)
      expect(
        calls.map(c => (c.body as { model?: string }).model),
        'the route was asked for the model'
      ).toContain(model)
    },
    SLOW_IMPORT_TIMEOUT_MS
  )

  it(
    'image_generate with a Kie name that has no price: no charge, no request',
    async () => {
      const gen = await tool('image_generate')
      const pool = recordingPool()
      const r = (await gen.handler(
        { prompt: 'кот', model: 'kie/no/such-model' }, // cyrillic-ok: test input
        { telegramId: CALLER, pool } as never
      )) as Record<string, unknown>
      expect(r['сделано']).toBe(false) // cyrillic-ok: the tool's response field
      expect(String(r['причина'])).toContain('kie/no/such-model') // cyrillic-ok: the tool's response field
      expect(
        charged(pool.sqls),
        'the wallet moved for a refused model'
      ).toEqual([])
      expect(calls, 'the route was asked anyway').toEqual([])
    },
    SLOW_IMPORT_TIMEOUT_MS
  )

  it(
    'video_generate with a Kie model whose bill the provider picks: no charge, no request',
    async () => {
      const gen = await tool('video_generate')
      // Billed per second with no length in the request: the bill cannot be
      // named before the press, so the app refuses it and so must the agent.
      const model = 'kie/bytedance/seedance-2'
      expect(kieVideoSaleOf(model).sold).toBe(false)
      const pool = recordingPool()
      const r = (await gen.handler({ prompt: 'кот', model, duration: 10 }, {
        telegramId: CALLER,
        pool,
      } as never)) as Record<string, unknown>
      expect(r['сделано']).toBe(false) // cyrillic-ok: the tool's response field
      expect(String(r['причина'])).toContain(model) // cyrillic-ok: the tool's response field
      expect(charged(pool.sqls)).toEqual([])
      expect(calls).toEqual([])
    },
    SLOW_IMPORT_TIMEOUT_MS
  )

  /*
   * THE CONTROL. Without it the two tests above pass on a handler that
   * refuses everything, or on a recording pool that never sees a charge.
   */
  it(
    'image_generate with a listed FAL model is charged and forwards exactly it',
    async () => {
      const gen = await tool('image_generate')
      const pool = recordingPool()
      await gen.handler({ prompt: 'кот', model: 'fal-ai/flux/dev' }, {
        telegramId: CALLER,
        pool,
      } as never)
      expect(charged(pool.sqls).length).toBe(1)
      const route = calls.find(c => c.url.endsWith('/api/generate/image'))
      expect(route, 'the route was never asked').toBeDefined()
      expect((route!.body as { model?: unknown }).model).toBe('fal-ai/flux/dev')
    },
    SLOW_IMPORT_TIMEOUT_MS
  )

  it(
    'video_generate with a Kie model whose bill is named is charged and forwards exactly it',
    async () => {
      const gen = await tool('video_generate')
      const model = 'kie/kling/v3-turbo-text-to-video'
      expect(kieVideoSaleOf(model).sold).toBe(true)
      const pool = recordingPool()
      await gen.handler({ prompt: 'кот', model, duration: 10 }, {
        telegramId: CALLER,
        pool,
      } as never)
      expect(charged(pool.sqls).length).toBe(1)
      const route = calls.find(c => c.url.endsWith('/api/generate/video'))
      expect(route, 'the route was never asked').toBeDefined()
      expect((route!.body as { model?: unknown }).model).toBe(model)
    },
    SLOW_IMPORT_TIMEOUT_MS
  )

  it(
    'video_generate without a model is charged and asks the route',
    async () => {
      const gen = await tool('video_generate')
      const pool = recordingPool()
      await gen.handler({ prompt: 'кот', duration: 5 }, {
        telegramId: CALLER,
        pool,
      } as never)
      expect(charged(pool.sqls).length).toBe(1)
      expect(calls.some(c => c.url.endsWith('/api/generate/video'))).toBe(true)
    },
    SLOW_IMPORT_TIMEOUT_MS
  )

  it(
    'the schema offers the model the handler takes, and nothing else',
    async () => {
      const gen = await tool('image_generate')
      const model = (
        gen.parameters as { properties: Record<string, { enum?: string[] }> }
      ).properties.model
      expect(model.enum).toEqual([...FAL_IMAGE_MODELS])
    },
    SLOW_IMPORT_TIMEOUT_MS
  )
})
