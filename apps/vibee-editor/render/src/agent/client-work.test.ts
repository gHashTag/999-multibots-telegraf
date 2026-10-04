/**
 * Client work carries the client's marks, never the house's (audit 04.10,
 * wave 2). On client work ctx.telegramId is the OWNER, so the only way to know
 * a turn is for a client is `faceOf` / `sellerSweep` -- onClientWork.
 */
import { describe, it, expect } from 'vitest'
import {
  HOUSE_ADVERT_COMPOSITIONS,
  HOUSE_BRAND_REFUSED,
  HOUSE_REEL_REFUSED,
  NOIR_BRAND_FIELDS,
  houseReelRefusal,
  onClientWork,
} from './client-work'
import { TOOLS_BY_NAME } from './tools'
import { NoirReelSchema } from '../compositions/NoirReel'
import { namesHouse } from '../house-names'

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
})

describe('a house advert is never a client reel', () => {
  it('the house adverts are refused whatever the props', () => {
    for (const id of ['RelaunchReel', 'TrinityBlogReel']) {
      expect(HOUSE_ADVERT_COMPOSITIONS.has(id)).toBe(true)
      expect(houseReelRefusal(id, { botHandle: '@her_shop_bot' })).toBe(
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
