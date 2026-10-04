/**
 * Client work carries the client's marks, never the house's (audit 04.10,
 * wave 2). On client work ctx.telegramId is the OWNER, so the only way to know
 * a turn is for a client is `faceOf` / `sellerSweep` -- onClientWork.
 */
import { afterEach, describe, it, expect, vi } from 'vitest'
import {
  HOUSE_ADVERT_COMPOSITIONS,
  HOUSE_BRAND_REFUSED,
  HOUSE_REEL_REFUSED,
  NOIR_BRAND_FIELDS,
  houseReelRefusal,
  onClientWork,
} from './client-work'
import { TOOLS_BY_NAME } from './tools'
import { clientStoryCard } from './story-reel-tool'
import { NoirReelSchema } from '../compositions/NoirReel'
import { namesHouse } from '../house-names'
import { houseOwnTurn } from '../split-reel-plan'
import * as REEL from '../spec/crm-story-reel.gen'

const herBrand = {
  masthead: 'Studio Masha',
  eyebrow: 'Nails and brows',
  name: 'Masha Nails',
  cta: 'Book a visit',
  sub: 'link in profile',
}

describe('onClientWork', () => {
  it('a client turn or a seller sweep is client work; the caller alone is not', () => {
    expect(onClientWork({ faceOf: '900000077' })).toBe(true)
    expect(onClientWork({ sellerSweep: true })).toBe(true)
    expect(onClientWork({})).toBe(false)
    expect(onClientWork({ faceOf: '  ', sellerSweep: false })).toBe(false)
  })

  it("a split reel is the house's own only when onClientWork says the turn is not client work", () => {
    // houseOwnTurn asks onClientWork, the one rule, not its own reading of
    // faceOf: a client turn with no lead named is still not the house's.
    expect(houseOwnTurn({ house: true, faceOf: '900000077' }, '')).toBe(false)
    const turns = [
      { house: true },
      { house: true, faceOf: '900000077' },
      { house: true, sellerSweep: true },
      { house: true, faceOf: '900000077', sellerSweep: true },
      { house: false },
      { house: false, faceOf: '900000077' },
    ]
    for (const t of turns)
      expect(houseOwnTurn(t, '')).toBe(t.house && !onClientWork(t))
  })
})

describe('a house advert is never a client reel', () => {
  it('the house adverts are refused whatever the props', () => {
    for (const id of ['RelaunchReel', 'TrinityBlogReel']) {
      expect(HOUSE_ADVERT_COMPOSITIONS.has(id)).toBe(true)
      expect(houseReelRefusal(id, { botHandle: '@placeholder_pay_bot' })).toBe(
        HOUSE_REEL_REFUSED
      )
    }
  })

  it("NoirReel's default brand IS the house, so a client NoirReel needs her brand", () => {
    // The reason the rule exists: a missing brand renders the house's.
    const fallback = NoirReelSchema.parse({ lipSyncVideo: 'x.mp4' }).brand
    expect(namesHouse(Object.values(fallback).join(' '))).toBe(true)
    expect(Object.keys(fallback).sort()).toEqual([...NOIR_BRAND_FIELDS].sort())

    expect(houseReelRefusal('NoirReel', {})).toBe(HOUSE_BRAND_REFUSED)
    expect(houseReelRefusal('NoirReel', { brand: fallback })).toBe(
      HOUSE_BRAND_REFUSED
    )
    expect(
      houseReelRefusal('NoirReel', { brand: { ...herBrand, sub: '' } })
    ).toBe(HOUSE_BRAND_REFUSED)
    expect(houseReelRefusal('NoirReel', { brand: herBrand })).toBeNull()
  })

  it('the client reels and the game reel are not refused', () => {
    for (const id of ['StoryReel', 'SplitTalkingHead', 'LeelaPlanReel'])
      expect(houseReelRefusal(id, {})).toBeNull()
  })
})

describe('reel_render on client work', () => {
  const reel = TOOLS_BY_NAME.get('reel_render')!
  const recording = () => {
    const calls: string[] = []
    const pool = {
      async query(sql: string) {
        calls.push(sql)
        // A twin, so a turn that passes the guard stops before any charge.
        return /SELECT render_id/.test(sql)
          ? { rows: [{ render_id: 'r1', output_url: 'https://ours/r1.mp4' }] }
          : { rows: [] }
      },
    }
    return { calls, pool }
  }

  it('refuses a house advert before the twin lookup and the charge', async () => {
    for (const extra of [{ faceOf: '900000077' }, { sellerSweep: true }]) {
      const { calls, pool } = recording()
      const r: any = await reel.handler(
        { compositionId: 'RelaunchReel', props: {} },
        { telegramId: '900000001', pool, ...extra } as never
      )
      expect(r.причина).toBe(HOUSE_REEL_REFUSED) // cyrillic-ok: the tool's result field
      expect(calls).toEqual([])
    }
  })

  it('the house still renders its own advert', async () => {
    const { calls, pool } = recording()
    const r: any = await reel.handler(
      { compositionId: 'RelaunchReel', props: {} },
      { telegramId: '900000001', pool } as never
    )
    expect(r.url).toBe('https://ours/r1.mp4')
    expect(calls.length).toBeGreaterThan(0)
  })
})

describe("reel_render draws a client's StoryReel on her card or a neutral one", () => {
  const reel = TOOLS_BY_NAME.get('reel_render')!
  const HOUSE = [
    REEL.END_CARD_DEFAULT_BG,
    REEL.END_CARD_DEFAULT_TITLE,
    REEL.END_CARD_DEFAULT_TEXT,
    REEL.END_CARD_DEFAULT_ACCENT,
  ].map(c => c.toLowerCase())
  /** No twin, so the render starts; the twin lookup's fingerprint is kept. */
  const noTwin = () => {
    const prints: unknown[] = []
    const pool = {
      async query(sql: string, params?: unknown[]) {
        if (/SELECT render_id/.test(sql)) prints.push(params?.[1])
        return { rows: [] }
      },
    }
    return { prints, pool }
  }
  /** The render start this process would POST to itself. */
  const started = () => {
    const bodies: any[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: unknown, init?: { body?: unknown }) => {
        bodies.push(JSON.parse(String(init?.body)))
        return new Response(JSON.stringify({ renderId: 'r9' }), {
          status: 200,
        })
      })
    )
    return bodies
  }
  afterEach(() => vi.unstubAllGlobals())
  const clientTurn = (pool: unknown) =>
    ({
      telegramId: '900000001',
      pool,
      faceOf: '900000077',
      chargeLater: true,
    }) as never
  const ownTurn = (pool: unknown) =>
    ({ telegramId: '900000001', pool, chargeLater: true }) as never

  it('a call with no card goes out on the neutral card, looked up as drawn', async () => {
    const bodies = started()
    const client = noTwin()
    const r: any = await reel.handler(
      {
        compositionId: 'StoryReel',
        props: { cta: 'Book a visit' },
        wait: false,
      },
      clientTurn(client.pool)
    )
    expect(r.началось).toBe(true) // cyrillic-ok: the tool's result field
    const card = bodies[0].props.endCard
    expect(card).toEqual(clientStoryCard(undefined, 'Book a visit'))
    for (const k of ['bg', 'title', 'text', 'accent'])
      expect(HOUSE).not.toContain(String(card[k]).toLowerCase())
    // The twin was looked up for the reel that is drawn, not the one asked.
    const own = noTwin()
    await reel.handler(
      { compositionId: 'StoryReel', props: bodies[0].props, wait: false },
      ownTurn(own.pool)
    )
    expect(client.prints).toHaveLength(1)
    expect(client.prints).toEqual(own.prints)
  })

  it("the seller's own StoryReel and a client's with neither card nor call go as given", async () => {
    const bodies = started()
    await reel.handler(
      {
        compositionId: 'StoryReel',
        props: { cta: 'Book a visit' },
        wait: false,
      },
      ownTurn(noTwin().pool)
    )
    expect(bodies[0].props).toEqual({ cta: 'Book a visit' })
    await reel.handler(
      { compositionId: 'StoryReel', props: { cta: '' }, wait: false },
      clientTurn(noTwin().pool)
    )
    expect(bodies[1].props).toEqual({ cta: '' })
  })
})
