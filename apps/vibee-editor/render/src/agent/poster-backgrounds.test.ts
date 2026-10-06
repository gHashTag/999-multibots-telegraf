import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  backgroundFor,
  forgetBackgrounds,
  keepBackground,
} from './poster-backgrounds'
import { overlayRefusedHint } from './poster-facts-draw'

const PROMPT = 'jazz poster, 25 октября в 19:00, вход 1 500 ₽'
const HEARD = 'афиша: Jazz Night, 25 октября в 19:00, вход 1 500 ₽'

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
    keepBackground('a', 'Jazz  poster', bg, 0)
    expect(backgroundFor('a', ' jazz poster ', 1000)?.provider).toBe('kie')
  })

  it('never serves another owner or another prompt', () => {
    keepBackground('a', 'jazz poster', bg, 0)
    expect(backgroundFor('b', 'jazz poster', 0)).toBeNull()
    expect(backgroundFor('a', 'rock poster', 0)).toBeNull()
  })

  it('is forgotten after half an hour', () => {
    keepBackground('a', 'jazz poster', bg, 0)
    expect(backgroundFor('a', 'jazz poster', 30 * 60_000 + 1)).toBeNull()
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

  it('redraws on the kept background: one generation, one charge', async () => {
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
  }, 30_000)

  it('another client of the same owner gets a new generation', async () => {
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
  }, 30_000)
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
