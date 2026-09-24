/**
 * THE CHANNEL A LINK INTO THE BOT CARRIES (tick 9, epic #2974).
 *
 * The render tags a link into our bot with its channel at the end of the
 * /start payload (`app_feed__telegram`); the bot cuts it off before reading
 * the payload and counts the start. Each case is a way that could go wrong:
 * the tag breaking the link it rides on, a stranger's payload stored as a
 * campaign, or the two processes disagreeing on the separator.
 */
import { describe, it, expect } from 'vitest'
import {
  APP_ROUTES,
  START_SOURCE_SEP,
  UNLINKABLE_APP_ROUTES,
  appRouteFromStartParam,
  splitStartSource,
} from '@/navigation/helpers/appLinks'
import {
  START_SOURCE_SEP as RENDER_SEP,
  tagged,
} from '../../../apps/vibee-editor/render/src/agent/utm'

describe('cutting the channel off a /start payload', () => {
  it('our link keeps opening its screen, and the channel is read', () => {
    const s = splitStartSource('app_feed__telegram')
    expect(s).toEqual({
      base: 'app_feed',
      source: 'telegram',
      campaign: 'app_feed',
    })
    expect(appRouteFromStartParam(s.base)).toBe('feed')
  })

  it('a payload without a channel passes exactly as it came', () => {
    for (const p of [
      'app_feed',
      'club',
      '144022504',
      'promo',
      '',
      'crm-prep-12345',
    ])
      expect(splitStartSource(p)).toEqual({
        base: p,
        source: null,
        campaign: '',
      })
  })

  it("a stranger's payload never becomes a stored campaign", () => {
    expect(splitStartSource('144022504__x')).toEqual({
      base: '144022504',
      source: 'x',
      campaign: '',
    })
    expect(splitStartSource('__reddit')).toEqual({
      base: '',
      source: 'reddit',
      campaign: '',
    })
  })

  it('only a clean channel counts; anything else is left in the payload', () => {
    for (const p of [
      'app_feed__X',
      'app_feed__',
      `app_feed__${'a'.repeat(33)}`,
      'app_feed__a.b',
    ])
      expect(splitStartSource(p).source, p).toBeNull()
  })
})

describe('the render and the bot agree', () => {
  it('one separator on both sides', () => {
    expect(RENDER_SEP).toBe(START_SOURCE_SEP)
  })

  it('every link the render tags is read back by the bot as it was built', () => {
    const payloads = [
      ...APP_ROUTES.filter(r => !UNLINKABLE_APP_ROUTES.includes(r)).map(
        r => `app_${r}`
      ),
      'club',
      'topup',
      'topup_rub',
    ]
    for (const p of payloads) {
      const link = tagged(`https://t.me/example_bot?start=${p}`, 'linkedin')
      const payload = new URL(link).searchParams.get('start')!
      expect(payload.length, p).toBeLessThanOrEqual(64)
      expect(splitStartSource(payload), p).toEqual({
        base: p,
        source: 'linkedin',
        campaign: p,
      })
    }
  })
})

describe('/start reads the payload our link built', () => {
  it('the channel is cut off before any branch reads the payload', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const src = readFileSync(
      join(__dirname, '..', '..', 'navigation', 'registerCommands.ts'),
      'utf8'
    )
    const cut = src.indexOf('splitStartSource(parts[1])')
    expect(cut).toBeGreaterThan(-1)
    expect(cut).toBeLessThan(src.indexOf('crmPrepLead(startParam)'))
    expect(cut).toBeLessThan(src.indexOf('appRouteFromStartParam(startParam)'))
    expect(src).not.toMatch(/const startParam = parts\[1\]/)
  })
})
