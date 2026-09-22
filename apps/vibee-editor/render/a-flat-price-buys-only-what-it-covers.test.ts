/**
 * A TOOL SOLD AT ONE PRICE BUYS ONLY WHAT THAT PRICE COVERS.
 *
 * `image_generate` charges 2 tokens and `video_generate` 40, whatever the
 * caller names in `model`. The handler forwarded that name to our own
 * /api/generate/* with the agent key; the route skips its own charge for that
 * key and sends `kie/<id>` to its explicit Kie branch. So the agent chat and
 * /mcp could buy kie/google/imagen4-ultra ($0.06) for what covers $0.005, and
 * a 10-second kie/kling/v3-turbo clip ($0.90) for what covers $0.10.
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
import { costCeilingUsd } from './src/agent/billing-shared'
import { СЕБЕСТОИМОСТЬ_USD } from './src/agent/kie-prices.generated' // cyrillic-ok: generated table name

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
    // of those models costs many times what the flat price covers.
    const ceiling = costCeilingUsd('image_generate')
    const dearest = Math.max(...ids.map(id => СЕБЕСТОИМОСТЬ_USD[id] ?? 0)) // cyrillic-ok: generated table name
    expect(dearest / ceiling).toBeGreaterThan(5)
  })

  it('image: an allow-list, so a name nobody listed is refused too', () => {
    for (const other of ['nobody/knows-this', 'KIE/google/imagen4', 42, {}])
      expect(imageModelRefusal(other), String(other)).not.toBeNull()
  })

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

  it('image_generate with a Kie model: no charge, no request', async () => {
    const gen = await tool('image_generate')
    const pool = recordingPool()
    const r = (await gen.handler(
      { prompt: 'кот', model: 'kie/google/imagen4-ultra' },
      { telegramId: CALLER, pool } as never
    )) as Record<string, unknown>
    expect(r['сделано']).toBe(false) // cyrillic-ok: the tool's response field
    expect(String(r['причина'])).toContain('kie/google/imagen4-ultra') // cyrillic-ok: the tool's response field
    expect(charged(pool.sqls), 'the wallet moved for a refused model').toEqual(
      []
    )
    expect(calls, 'the route was asked anyway').toEqual([])
  })

  it('video_generate with a Kie model: no charge, no request', async () => {
    const gen = await tool('video_generate')
    const pool = recordingPool()
    const r = (await gen.handler(
      {
        prompt: 'кот',
        model: 'kie/kling/v3-turbo-text-to-video',
        duration: 10,
      },
      { telegramId: CALLER, pool } as never
    )) as Record<string, unknown>
    expect(r['сделано']).toBe(false) // cyrillic-ok: the tool's response field
    expect(charged(pool.sqls)).toEqual([])
    expect(calls).toEqual([])
  })

  /*
   * THE CONTROL. Without it the two tests above pass on a handler that
   * refuses everything, or on a recording pool that never sees a charge.
   */
  it('image_generate with a listed FAL model is charged and forwards exactly it', async () => {
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
  })

  it('video_generate without a model is charged and asks the route', async () => {
    const gen = await tool('video_generate')
    const pool = recordingPool()
    await gen.handler({ prompt: 'кот', duration: 5 }, {
      telegramId: CALLER,
      pool,
    } as never)
    expect(charged(pool.sqls).length).toBe(1)
    expect(calls.some(c => c.url.endsWith('/api/generate/video'))).toBe(true)
  })

  it('the schema offers the model the handler takes, and nothing else', async () => {
    const gen = await tool('image_generate')
    const model = (
      gen.parameters as { properties: Record<string, { enum?: string[] }> }
    ).properties.model
    expect(model.enum).toEqual([...FAL_IMAGE_MODELS])
  })
})
