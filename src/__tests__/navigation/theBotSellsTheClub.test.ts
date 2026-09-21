import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * THE BOT SELLS THE ONE CLUB, THROUGH THE RENDER'S CASHIER.
 *
 * Measured 2026-09-22: 49 new people in the bots in thirty days -> 5 opened
 * the Mini App -> 2 got a club invoice -> 0 paid. Every club offer lived in
 * the Mini App; the bot, where the people are, sold the retired BASIC / PRO /
 * STUDIO tiers after the free portrait and on the main keyboard, and /club
 * showed the "Golden Foundry" (0 sales ever). The owner: the only subscription
 * is the club, 10 000 Stars every 30 days, 30% back in tokens.
 *
 * What is pinned here is behaviour, run through the real handlers:
 *  - the card shows the price the CASHIER sent, not a number typed in the bot;
 *  - "Join" mints through the render (server key + the person's id) and the
 *    person gets exactly the link the render minted;
 *  - a member is never sold what they have;
 *  - the press is answered first, before seconds of network;
 *  - every old door -- /club, /foundry, start links, the subscription scene,
 *    retired tier callbacks -- lands on this card;
 *  - each step is a row in the funnel.
 */

vi.mock('@/core/supabase', () => ({
  getUserDetailsSubscription: vi.fn(async () => ({ isExist: true })),
  getReferalsCountAndUserData: vi.fn(),
  createUser: vi.fn(),
  updateUserLanguage: vi.fn(),
}))
vi.mock('@/store', () => ({ defaultSession: { mode: null } }))

import {
  showClubCard,
  joinClub,
  registerClubButtons,
  CLUB_CARD,
  CLUB_JOIN,
  RETIRED_OFFER_CALLBACK,
} from '@/navigation/helpers/clubCard'
import { setEventsPoolForTests } from '@/services/trackEvent'
/*
 * Imported statically, not inside a test: the command registry pulls in the
 * whole bot and takes seconds to load. Loading it at collect time keeps that
 * cost out of any single test's clock, so a busy machine cannot turn it into
 * a timeout that looks like a finding.
 */
import { registerCommands } from '@/navigation/registerCommands'
import { subscriptionScene } from '@/scenes/subscriptionScene'
import { strictEventsDb } from '../services/strictEventsDb'
import { clubRender, STRANGER_STATUS } from './renderClubDouble'

const KEY = 'server-key-for-tests'
const ME = 900000041

/** Methods a Telegraf context has that these paths must NOT use. */
const FORBIDDEN = new Set([
  'replyWithHTML',
  'replyWithMarkdown',
  'replyWithInvoice',
  'editMessageText',
  'editMessageReplyMarkup',
  'sendInvoice',
])

function person(opts: { lang?: 'ru' | 'en'; chat?: string } = {}) {
  const order: string[] = []
  const replies: Array<{ text: string; extra: any }> = []
  const base: Record<string, any> = {
    from: { id: ME, language_code: opts.lang ?? 'ru', username: 'someone' },
    chat: { id: ME, type: opts.chat ?? 'private' },
    botInfo: { username: 'test_bot' },
    state: {},
    session: {},
    reply: vi.fn(async (text: string, extra?: any) => {
      order.push('reply')
      replies.push({ text: String(text), extra })
      return {}
    }),
    answerCbQuery: vi.fn(async () => {
      order.push('answerCbQuery')
      return true
    }),
    scene: {
      current: null,
      leave: vi.fn(async () => undefined),
      enter: vi.fn(async () => undefined),
    },
  }
  const ctx = new Proxy(base, {
    get(t, k) {
      if (typeof k === 'string' && FORBIDDEN.has(k)) {
        throw new Error(`the club must not call ctx.${k}`)
      }
      return t[k as string]
    },
  })
  return { ctx: ctx as any, order, replies }
}

const buttons = (extra: any) =>
  (extra?.reply_markup?.inline_keyboard ?? []).flat() as Array<{
    text: string
    callback_data?: string
    url?: string
    web_app?: { url: string }
  }>

let db: ReturnType<typeof strictEventsDb>
const events = () => db.rows('user_events').map(r => r.event)

beforeEach(() => {
  db = strictEventsDb()
  setEventsPoolForTests(db)
  process.env.RENDER_API_KEY = KEY
})
afterEach(() => {
  setEventsPoolForTests(null)
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('the card', () => {
  it('shows the price, the period and the tokens back -- as the cashier sent them', async () => {
    const render = clubRender({ key: KEY })
    const { ctx, replies } = person()
    await showClubCard(ctx, 'command', { fetchImpl: render.fetchImpl })
    expect(render.calls).toEqual([
      { route: 'GET /api/club/status', who: String(ME) },
    ])
    expect(replies).toHaveLength(1)
    const { text, extra } = replies[0]
    expect(text).toMatch(/10\s000 ⭐ за 30 дней/) // cyrillic-ok: UI copy under test
    expect(text).toMatch(/2\s571 токенов/) // cyrillic-ok: UI copy under test
    expect(text).not.toMatch(/BASIC|PRO\b|STUDIO|NEURO|Литейн|Foundry/) // cyrillic-ok: UI copy under test
    const join = buttons(extra).find(b => b.callback_data === CLUB_JOIN)
    expect(join?.text).toMatch(/Вступить за 10\s000 ⭐/) // cyrillic-ok: UI copy under test
    expect(extra.parse_mode).toBe('HTML')
  })

  it('has no price of its own: another price from the cashier is another price on the card', async () => {
    const status = {
      ...STRANGER_STATUS,
      stars: 7777,
      tokens_per_period: 1234,
      period_days: 31,
    }
    const en = person({ lang: 'en' })
    await showClubCard(en.ctx, 'command', {
      fetchImpl: clubRender({ key: KEY, status }).fetchImpl,
    })
    expect(en.replies[0].text).toMatch(/7,777 ⭐ for 31 days/)
    expect(en.replies[0].text).toMatch(/1,234 tokens/)
    expect(en.replies[0].text).not.toMatch(/10,000|2,571/)
    // And in Russian, which is the other copy of the same sentence.
    const ru = person({ lang: 'ru' })
    await showClubCard(ru.ctx, 'command', {
      fetchImpl: clubRender({ key: KEY, status }).fetchImpl,
    })
    expect(ru.replies[0].text).toMatch(/7\s777 ⭐ за 31 дней/) // cyrillic-ok: UI copy under test
    expect(ru.replies[0].text).toMatch(/1\s234 токенов/) // cyrillic-ok: UI copy under test
    expect(ru.replies[0].text).not.toMatch(/10\s000|2\s571/)
    const join = buttons(ru.replies[0].extra).find(
      b => b.callback_data === CLUB_JOIN
    )
    expect(join?.text).toMatch(/7\s777 ⭐/)
  })

  it('records that the card was seen, with where it was asked for', async () => {
    const render = clubRender({ key: KEY })
    const { ctx } = person()
    await showClubCard(ctx, 'greeting', { fetchImpl: render.fetchImpl })
    await vi.waitFor(() => expect(events()).toEqual(['club_card_shown']))
    expect(db.rows('user_events')[0]).toMatchObject({
      telegram_id: String(ME),
      detail: { source: 'greeting', member: false },
    })
  })

  it('does not sell the club to a member: no price, no join button', async () => {
    const render = clubRender({
      key: KEY,
      status: {
        ...STRANGER_STATUS,
        active: true,
        granted: 'owner',
        until: '2026-10-10T00:00:00.000Z',
        days_left: 18,
      },
    })
    const { ctx, replies } = person()
    await showClubCard(ctx, 'command', { fetchImpl: render.fetchImpl })
    const { text, extra } = replies[0]
    expect(text).toContain('Вы в клубе')
    expect(text).toContain('владельцу бота')
    expect(text).not.toMatch(/10\s000/)
    expect(buttons(extra).some(b => b.callback_data === CLUB_JOIN)).toBe(false)
  })

  it('says the cashier did not answer, offers a retry, and records no card', async () => {
    const render = clubRender({ key: KEY, down: ['GET /api/club/status'] })
    const { ctx, replies } = person()
    await showClubCard(ctx, 'command', { fetchImpl: render.fetchImpl })
    expect(replies[0].text).toContain('Касса клуба сейчас не ответила')
    expect(
      buttons(replies[0].extra).some(b => b.callback_data === CLUB_CARD)
    ).toBe(true)
    await new Promise(r => setTimeout(r, 10))
    expect(events()).toEqual([])
  })

  it('asks the render with the server key, never without it', async () => {
    delete process.env.RENDER_API_KEY
    const render = clubRender({ key: KEY })
    const { ctx, replies } = person()
    await showClubCard(ctx, 'command', { fetchImpl: render.fetchImpl })
    expect(render.calls).toEqual([])
    expect(replies[0].text).toContain('Касса клуба сейчас не ответила')
  })
})

describe('the join press', () => {
  it('hands over exactly the link the render minted, and records the invoice', async () => {
    const link = 'https://t.me/$club-invoice-for-900000041'
    const render = clubRender({
      key: KEY,
      invoice: {
        ok: true,
        link,
        stars: 10000,
        tokens: 2571,
        period_days: 30,
      },
    })
    const { ctx, replies } = person()
    await joinClub(ctx, { fetchImpl: render.fetchImpl })
    expect(render.calls).toEqual([
      { route: 'POST /api/club/invoice', who: String(ME) },
    ])
    const pay = buttons(replies[0].extra).find(b => b.url)
    expect(pay?.url).toBe(link)
    expect(pay?.text).toMatch(/Оплатить 10\s000 ⭐/) // cyrillic-ok: UI copy under test
    expect(replies[0].text).toMatch(/2\s571 токенов/) // cyrillic-ok: UI copy under test
    await vi.waitFor(() => expect(events()).toEqual(['club_invoice_created']))
  })

  it('refuses a link that is not a Telegram invoice link', async () => {
    const render = clubRender({
      key: KEY,
      invoice: {
        ok: true,
        link: 'https://evil.example/pay',
        stars: 10000,
        tokens: 2571,
        period_days: 30,
      },
    })
    const { ctx, replies } = person()
    await joinClub(ctx, { fetchImpl: render.fetchImpl })
    expect(buttons(replies[0].extra).some(b => b.url)).toBe(false)
    expect(replies[0].text).toContain('Касса клуба сейчас не ответила')
  })

  it('tells a member they are in, and mints nothing', async () => {
    const render = clubRender({
      key: KEY,
      invoice: {
        ok: false,
        already_active: true,
        granted: null,
        until: '2026-10-10T00:00:00.000Z',
        days_left: 18,
      },
    })
    const { ctx, replies } = person()
    await joinClub(ctx, { fetchImpl: render.fetchImpl })
    expect(replies[0].text).toContain('Вы в клубе')
    expect(buttons(replies[0].extra).some(b => b.url)).toBe(false)
    await new Promise(r => setTimeout(r, 10))
    expect(events()).toEqual([])
  })

  it('offers a retry when the cashier fails, instead of a dead end', async () => {
    const render = clubRender({ key: KEY, down: ['POST /api/club/invoice'] })
    const { ctx, replies } = person()
    await joinClub(ctx, { fetchImpl: render.fetchImpl })
    expect(
      buttons(replies[0].extra).some(b => b.callback_data === CLUB_JOIN)
    ).toBe(true)
  })
})

describe('the buttons are answered first and registered at bot level', () => {
  function collectingBot() {
    const actions: Array<{ trigger: unknown; handler: (ctx: any) => any }> = []
    const bot: any = {
      action: (trigger: unknown, handler: any) => {
        actions.push({ trigger, handler })
        return bot
      },
    }
    registerClubButtons(bot)
    const find = (data: string) =>
      actions.find(a =>
        a.trigger instanceof RegExp ? a.trigger.test(data) : a.trigger === data
      )
    return { find }
  }

  it('answers the press before the network, on join and on the card', async () => {
    // The press is answered with nothing behind it: the network is slow.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        await new Promise(r => setTimeout(r, 30))
        throw new Error('slow and then gone')
      })
    )
    const { find } = collectingBot()
    for (const data of [CLUB_JOIN, CLUB_CARD, 'pro']) {
      const { ctx, order } = person()
      await find(data)!.handler(ctx)
      expect(order[0], data).toBe('answerCbQuery')
      expect(order).toContain('reply')
    }
  })

  it('lands the retired offers on the card, and nothing that merely looks like them', () => {
    for (const d of [
      'basic',
      'pro',
      'studio',
      'club_buy_apprentice',
      'club_buy_master',
      'club_buy_founder',
    ]) {
      expect(RETIRED_OFFER_CALLBACK.test(d), d).toBe(true)
    }
    for (const d of [
      'professional',
      'probe',
      'club_join',
      'club_card',
      'club_buy_other',
      'basics',
    ]) {
      expect(RETIRED_OFFER_CALLBACK.test(d), d).toBe(false)
    }
  })
})

describe('every old door lands on the club card', () => {
  it('the subscription scene shows the card and leaves; it lists no tiers', async () => {
    vi.stubGlobal('fetch', clubRender({ key: KEY }).fetchImpl)
    const steps = (subscriptionScene as any).steps as Array<
      (ctx: any, next: () => Promise<void>) => Promise<unknown>
    >
    expect(steps).toHaveLength(1)
    const { ctx, replies } = person()
    await steps[0](ctx, async () => undefined)
    expect(ctx.scene.leave).toHaveBeenCalled()
    expect(replies).toHaveLength(1)
    expect(replies[0].text).toContain('Клуб — ваш цифровой двойник')
    expect(replies[0].text).not.toMatch(/BASIC|PRO\b|STUDIO|₽/)
  })

  async function commands() {
    const cmds = new Map<string, (ctx: any) => Promise<unknown>>()
    const bot: any = {
      command(name: string | string[], handler: any) {
        for (const n of Array.isArray(name) ? name : [name])
          cmds.set(n, handler)
        return bot
      },
      use: () => bot,
      on: () => bot,
      action: () => bot,
      hears: () => bot,
      catch: () => bot,
      telegram: {
        setMyCommands: vi.fn(async () => undefined),
        setChatMenuButton: vi.fn(async () => undefined),
        getMe: vi.fn(async () => ({ id: 1, username: 'test_bot' })),
      },
      botInfo: { username: 'test_bot' },
    }
    registerCommands({ bot })
    return cmds
  }

  function commandCtx(text: string) {
    const p = person()
    p.ctx.message = { text }
    p.ctx.telegram = { sendMessage: vi.fn(async () => undefined) }
    return p
  }

  for (const cmd of ['club', 'foundry']) {
    it(`/${cmd} is the club, not the Golden Foundry`, async () => {
      vi.stubGlobal('fetch', clubRender({ key: KEY }).fetchImpl)
      const cmds = await commands()
      const { ctx, replies } = commandCtx(`/${cmd}`)
      await cmds.get(cmd)!(ctx)
      expect(replies.map(r => r.text).join('\n')).toContain(
        'Клуб — ваш цифровой двойник'
      )
      expect(replies.map(r => r.text).join('\n')).not.toMatch(
        /Литейн|Foundry|1499|3999|12499/ // cyrillic-ok: UI copy under test
      )
    })
  }

  for (const param of ['club', 'foundry', 'subscribe_middle_stars']) {
    it(`/start ${param} opens the club card for a known person`, async () => {
      vi.stubGlobal('fetch', clubRender({ key: KEY }).fetchImpl)
      const cmds = await commands()
      const { ctx, replies } = commandCtx(`/start ${param}`)
      await cmds.get('start')!(ctx)
      expect(ctx.scene.enter).not.toHaveBeenCalledWith('subscription_scene')
      expect(replies.map(r => r.text).join('\n')).toContain(
        'Клуб — ваш цифровой двойник'
      )
      // The link's plan and cashier named things that do not exist; they are
      // not carried into the session to narrow anything.
      expect(ctx.session.payMethod).toBeUndefined()
    })
  }

  it('/start subscribe_* survives registration for a new person', async () => {
    const supa = await import('@/core/supabase')
    ;(supa.getUserDetailsSubscription as any).mockResolvedValueOnce({
      isExist: false,
    })
    const cmds = await commands()
    const { ctx } = commandCtx('/start subscribe_junior_robokassa')
    await cmds.get('start')!(ctx)
    expect(ctx.scene.enter).toHaveBeenCalledWith('create_user_scene')
    expect(ctx.session.clubDeepLink).toBe(true)
  })
})
