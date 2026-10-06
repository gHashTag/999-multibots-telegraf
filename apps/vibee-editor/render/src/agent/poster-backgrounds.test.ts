import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  backgroundFor,
  forgetBackgrounds,
  keepBackground,
  sizeKey,
} from './poster-backgrounds'
import { overlayRefusedHint } from './poster-facts-draw'

const PROMPT = 'jazz poster, 25 октября в 19:00, вход 1 500 ₽'
const SQ = sizeKey(undefined, undefined)
const HEARD = 'афиша: Jazz Night, 25 октября в 19:00, вход 1 500 ₽'

/*
 * Budget for every test that draws on the real canvas (#3742): the first
 * canvas call in a worker loads cairo and fontconfig and the handler imports
 * ./tools -- CPU-bound, so wall time scales with machine load.
 */
const CANVAS_TIMEOUT_MS = 30_000

async function blank(w: number, h: number): Promise<Buffer> {
  const { createCanvas } = await import('canvas')
  const c = createCanvas(w, h)
  const g = c.getContext('2d')
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, w, h)
  return c.toBuffer('image/png')
}

describe('the kept background', () => {
  beforeEach(() => forgetBackgrounds())
  const bg = {
    bytes: Buffer.from('x'),
    contentType: 'image/png',
    provider: 'kie',
  }

  it('is found by the same owner and the same prompt, spacing and case aside', () => {
    keepBackground('a', 'Jazz  poster', SQ, bg, 0)
    expect(backgroundFor('a', ' jazz poster ', SQ, 1000)?.provider).toBe('kie')
  })

  it('never serves another owner or another prompt', () => {
    keepBackground('a', 'jazz poster', SQ, bg, 0)
    expect(backgroundFor('b', 'jazz poster', SQ, 0)).toBeNull()
    expect(backgroundFor('a', 'rock poster', SQ, 0)).toBeNull()
  })

  it('never serves another size (#3736)', () => {
    keepBackground('a', 'jazz poster', sizeKey(1024, 1024), bg, 0)
    expect(backgroundFor('a', 'jazz poster', sizeKey(1024, 1536), 0)).toBeNull()
    expect(backgroundFor('a', 'jazz poster', sizeKey(1536, 1024), 0)).toBeNull()
  })

  it('reads a missing size as the route default, 1024 a side', () => {
    expect(sizeKey(undefined, undefined)).toBe('1024x1024')
    expect(sizeKey(0, null)).toBe('1024x1024')
    expect(sizeKey(1024, undefined)).toBe('1024x1024')
  })

  it('is forgotten after half an hour', () => {
    keepBackground('a', 'jazz poster', SQ, bg, 0)
    expect(backgroundFor('a', 'jazz poster', SQ, 30 * 60_000 + 1)).toBeNull()
  })
})

describe('the no-title hint', () => {
  it('says to tell the person, not to repeat the paid call', () => {
    const hint = overlayRefusedHint({ drawn: true, title: 'none' } as never)
    expect(hint).not.toMatch(/повтори/) // cyrillic-ok: the hint is Russian
    expect(hint).toMatch(/скажи человеку/) // cyrillic-ok: the hint is Russian
    expect(hint).toMatch(/без новой генерации/) // cyrillic-ok: the hint is Russian
  })
})

/*
 * A TITLE FOLLOW-UP NEVER PAYS FOR A SECOND PICTURE (#3733).
 *
 * The first call draws the facts and no title; the second, same prompt plus
 * a title, must not reach the image provider and must not debit again.
 */
describe('image_generate with a title after a picture without one', () => {
  const saved = {
    VISION_API_KEY: process.env.VISION_API_KEY,
    POSTER_FACTS_OVERLAY: process.env.POSTER_FACTS_OVERLAY,
  }
  const realFetch = globalThis.fetch
  beforeEach(() => {
    forgetBackgrounds()
    delete process.env.VISION_API_KEY
    delete process.env.POSTER_FACTS_OVERLAY
  })
  afterEach(() => {
    globalThis.fetch = realFetch
    for (const [k, v] of Object.entries(saved))
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
  })

  it(
    'redraws on the kept background: one generation, one charge',
    async () => {
      const source = await blank(768, 1152)
      let generations = 0
      const uploads: { type: string | null; body: Buffer }[] = []
      globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
        const u = String(url)
        if (u.endsWith('/api/generate/image')) {
          generations++
          return new Response(
            JSON.stringify({
              url: 'https://provider.test/p.jpg',
              provider: 'kie',
            }),
            { headers: { 'content-type': 'application/json' } }
          )
        }
        if (u === 'https://provider.test/p.jpg')
          return new Response(new Uint8Array(source), {
            headers: { 'content-type': 'image/png' },
          })
        if (u.endsWith('/upload')) {
          uploads.push({
            type: new Headers(init.headers).get('Content-Type'),
            body: Buffer.from(init.body as Uint8Array),
          })
          return new Response(
            JSON.stringify({
              directUrl: `https://s3.test/${uploads.length}.png`,
            }),
            { headers: { 'content-type': 'application/json' } }
          )
        }
        return new Response('{}', { status: 404 })
      }) as typeof fetch
      let debits = 0
      const pool = {
        query: async (sql: string) => {
          if (/balance = balance -/.test(String(sql))) debits++
          return { rows: [{ n: 0, id: 7, balance: 5000 }], rowCount: 1 }
        },
      }
      const ctx = { telegramId: '1', pool, heard: HEARD } as never
      const { TOOLS_BY_NAME } = await import('./tools')
      const tool = TOOLS_BY_NAME.get('image_generate')!

      const first: any = await tool.handler({ prompt: PROMPT }, ctx)
      expect(first['сделано']).toBe(true)
      expect(first.factsOverlay).toMatchObject({ title: 'none' })
      expect(generations).toBe(1)
      expect(debits).toBe(1)

      const second: any = await tool.handler(
        { prompt: PROMPT, title: 'Jazz Night' },
        ctx
      )
      expect(second['сделано']).toBe(true)
      expect(second.redrawn).toBe(true)
      expect(second.factsOverlay).toMatchObject({ title: 'drawn' })
      expect(second['токены']).toBeUndefined()
      expect(generations).toBe(1)
      expect(debits).toBe(1)
      expect(uploads).toHaveLength(2)
      expect(uploads[1].type).toBe('image/png')
      expect(uploads[1].body.equals(uploads[0].body)).toBe(false)
    },
    CANVAS_TIMEOUT_MS
  )

  it(
    'another client of the same owner gets a new generation',
    async () => {
      const source = await blank(768, 1152)
      let generations = 0
      globalThis.fetch = (async (url: string) => {
        const u = String(url)
        if (u.endsWith('/api/generate/image')) {
          generations++
          return new Response(
            JSON.stringify({
              url: 'https://provider.test/p.jpg',
              provider: 'kie',
            }),
            { headers: { 'content-type': 'application/json' } }
          )
        }
        if (u === 'https://provider.test/p.jpg')
          return new Response(new Uint8Array(source), {
            headers: { 'content-type': 'image/png' },
          })
        if (u.endsWith('/upload'))
          return new Response(
            JSON.stringify({ directUrl: 'https://s3.test/x.png' }),
            {
              headers: { 'content-type': 'application/json' },
            }
          )
        return new Response('{}', { status: 404 })
      }) as typeof fetch
      const pool = {
        query: async () => ({
          rows: [{ n: 0, id: 7, balance: 5000 }],
          rowCount: 1,
        }),
      }
      const { TOOLS_BY_NAME } = await import('./tools')
      const tool = TOOLS_BY_NAME.get('image_generate')!
      await tool.handler({ prompt: PROMPT }, {
        telegramId: '1',
        pool,
        heard: HEARD,
        faceOf: 'lead-a',
        chargeLater: true,
      } as never)
      await tool.handler({ prompt: PROMPT, title: 'Jazz Night' }, {
        telegramId: '1',
        pool,
        heard: HEARD,
        faceOf: 'lead-b',
        chargeLater: true,
      } as never)
      expect(generations).toBe(2)
    },
    CANVAS_TIMEOUT_MS
  )
})

describe('the title parameter', () => {
  it('asks for the title up front on a poster with a date or price', async () => {
    const { TOOLS_BY_NAME } = await import('./tools')
    const params: any = TOOLS_BY_NAME.get('image_generate')!.parameters
    expect(params.properties.title.description).toMatch(
      /при дате\/цене — сразу/ // cyrillic-ok: the description is Russian
    )
  })
})

/*
 * A NEW SIZE IS A NEW PICTURE (#3736).
 *
 * The kept background is the size it was drawn at. A title follow-up asking
 * for another size used to get the old size back, free and silently; now it
 * misses the cache and pays for one normal generation at the size it asked.
 */
describe('image_generate with a title and a size', () => {
  const saved = {
    VISION_API_KEY: process.env.VISION_API_KEY,
    POSTER_FACTS_OVERLAY: process.env.POSTER_FACTS_OVERLAY,
  }
  const realFetch = globalThis.fetch
  beforeEach(() => {
    forgetBackgrounds()
    delete process.env.VISION_API_KEY
    delete process.env.POSTER_FACTS_OVERLAY
  })
  afterEach(() => {
    globalThis.fetch = realFetch
    for (const [k, v] of Object.entries(saved))
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
  })

  /** Two calls, the second with a title; what reached the provider and the wallet. */
  async function twoCalls(
    firstSize: { width?: number; height?: number },
    secondSize: { width?: number; height?: number }
  ) {
    const source = await blank(768, 1152)
    const asked: { width?: number; height?: number }[] = []
    globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
      const u = String(url)
      if (u.endsWith('/api/generate/image')) {
        const b = JSON.parse(String(init.body))
        asked.push({ width: b.width, height: b.height })
        return new Response(
          JSON.stringify({
            url: 'https://provider.test/p.jpg',
            provider: 'kie',
          }),
          { headers: { 'content-type': 'application/json' } }
        )
      }
      if (u === 'https://provider.test/p.jpg')
        return new Response(new Uint8Array(source), {
          headers: { 'content-type': 'image/png' },
        })
      if (u.endsWith('/upload'))
        return new Response(
          JSON.stringify({ directUrl: 'https://s3.test/x.png' }),
          { headers: { 'content-type': 'application/json' } }
        )
      return new Response('{}', { status: 404 })
    }) as typeof fetch
    let debits = 0
    const pool = {
      query: async (sql: string) => {
        if (/balance = balance -/.test(String(sql))) debits++
        return { rows: [{ n: 0, id: 7, balance: 5000 }], rowCount: 1 }
      },
    }
    const ctx = { telegramId: '1', pool, heard: HEARD } as never
    const { TOOLS_BY_NAME } = await import('./tools')
    const tool = TOOLS_BY_NAME.get('image_generate')!
    await tool.handler({ prompt: PROMPT, ...firstSize }, ctx)
    const second: any = await tool.handler(
      { prompt: PROMPT, title: 'Jazz Night', ...secondSize },
      ctx
    )
    return { second, asked, debits }
  }

  it(
    'another size misses the kept background and pays once more',
    async () => {
      const r = await twoCalls(
        { width: 1024, height: 1024 },
        { width: 1024, height: 1536 }
      )
      expect(r.second['сделано']).toBe(true)
      expect(r.second.redrawn).toBeUndefined()
      expect(r.asked).toHaveLength(2)
      expect(r.asked[1]).toEqual({ width: 1024, height: 1536 })
      expect(r.debits).toBe(2)
    },
    CANVAS_TIMEOUT_MS
  )

  it(
    'the same size still redraws free',
    async () => {
      const r = await twoCalls(
        { width: 1024, height: 1536 },
        { width: 1024, height: 1536 }
      )
      expect(r.second.redrawn).toBe(true)
      expect(r.asked).toHaveLength(1)
      expect(r.debits).toBe(1)
    },
    CANVAS_TIMEOUT_MS
  )

  it(
    'no size in either call still redraws free',
    async () => {
      const r = await twoCalls({}, {})
      expect(r.second.redrawn).toBe(true)
      expect(r.asked).toHaveLength(1)
      expect(r.debits).toBe(1)
    },
    CANVAS_TIMEOUT_MS
  )

  it(
    'no size, then the default size said aloud, is the same picture',
    async () => {
      const r = await twoCalls({}, { width: 1024, height: 1024 })
      expect(r.second.redrawn).toBe(true)
      expect(r.asked).toHaveLength(1)
      expect(r.debits).toBe(1)
    },
    CANVAS_TIMEOUT_MS
  )
})
