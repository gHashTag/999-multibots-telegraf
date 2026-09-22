/**
 * LINKS TO OUR APP OPEN INSIDE TELEGRAM (src/navigation/helpers/appLinks.ts).
 *
 * Owner, 2026-09-22: outside Telegram the app does not open, so a plain
 * https link to it does not work. These pin the two links, the rewrite that
 * catches a raw URL in model text, and the door /start opens for app_<route>.
 * Bot names are invented; no real account appears here.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  APP_ROUTES,
  appLinkFor,
  appRouteFromStartParam,
  appButton,
  botHandle,
  forgetMainWebAppForTests,
  hasRawAppUrl,
  knownMainWebApp,
  refreshMainWebApp,
  rememberBotInfo,
  rememberMainWebApp,
  rewriteAppUrls,
  routeOfAppUrl,
  sendAppDoor,
  MAIN_WEB_APP_TTL_MS,
} from '@/navigation/helpers/appLinks'

const BOT = 'example_farm_bot'

beforeEach(() => forgetMainWebAppForTests())

describe('appLinkFor', () => {
  it('without a Main Mini App: the chat, with /start app_<route>', () => {
    expect(appLinkFor(BOT, 'hive')).toBe(
      'https://t.me/example_farm_bot?start=app_hive'
    )
  })

  it('with a Main Mini App: one tap, ?startapp=<route>', () => {
    expect(appLinkFor(BOT, 'hive', { mainWebApp: true })).toBe(
      'https://t.me/example_farm_bot?startapp=hive'
    )
  })

  it('reads the cache when the caller does not say', () => {
    rememberMainWebApp(BOT, true)
    expect(appLinkFor(BOT, 'chat')).toBe(
      'https://t.me/example_farm_bot?startapp=chat'
    )
    rememberMainWebApp(BOT, false)
    expect(appLinkFor(BOT, 'chat')).toBe(
      'https://t.me/example_farm_bot?start=app_chat'
    )
  })

  it('strips @ and the business_ alias, and refuses a non-username', () => {
    expect(appLinkFor('@Example_Farm_Bot', 'feed')).toBe(
      'https://t.me/Example_Farm_Bot?start=app_feed'
    )
    expect(appLinkFor('business_example_farm_bot', 'feed')).toBe(
      'https://t.me/example_farm_bot?start=app_feed'
    )
    for (const bad of ['', null, undefined, 'a b', 'x', 'evil.com/?', '../']) {
      expect(appLinkFor(bad as any, 'feed'), String(bad)).toBe('')
    }
    expect(botHandle('evil.com')).toBe('')
  })

  it('every route fits the start payload limits (64 chars, [A-Za-z0-9_-])', () => {
    for (const r of APP_ROUTES) {
      const p = `app_${r}`
      expect(p.length).toBeLessThanOrEqual(64)
      expect(p).toMatch(/^[A-Za-z0-9_-]+$/)
    }
  })
})

describe('appRouteFromStartParam', () => {
  it('reads app_<known route>', () => {
    expect(appRouteFromStartParam('app_hive')).toBe('hive')
    expect(appRouteFromStartParam('app_pair')).toBe('pair')
  })

  it('claims nothing else -- every other payload still goes where it went', () => {
    for (const other of [
      'app_',
      'app_nope',
      'app_hive_x',
      'App_hive',
      'hive',
      'club',
      'svc_neurophoto',
      'topup_rub',
      '900000012',
      '',
      null,
      undefined,
    ]) {
      expect(appRouteFromStartParam(other as any), String(other)).toBeNull()
    }
  })
})

describe('routeOfAppUrl', () => {
  it('reads the screen from the start param, the path, or falls home', () => {
    expect(
      routeOfAppUrl(
        'https://vibee-editor-production.up.railway.app/?tgWebAppStartParam=pair'
      )
    ).toBe('pair')
    expect(routeOfAppUrl('https://app.t27.ai/hive/queen')).toBe('hive')
    expect(routeOfAppUrl('https://app.t27.ai/generate/video')).toBe('video')
    expect(routeOfAppUrl('https://app.t27.ai/browser?type=1')).toBe('browser')
    expect(routeOfAppUrl('https://app.t27.ai/queen/')).toBe('hive')
    expect(routeOfAppUrl('https://app.t27.ai/some_user')).toBe('feed')
    expect(routeOfAppUrl('https://app.t27.ai')).toBe('feed')
  })
})

describe('rewriteAppUrls -- the safety net on model text', () => {
  it('turns every raw app URL into this bot’s in-Telegram link', () => {
    const text =
      'Откройте https://app.t27.ai/hive. А браузер тут: https://vibee-editor-production.up.railway.app/browser!'
    expect(rewriteAppUrls(text, BOT)).toBe(
      'Откройте https://t.me/example_farm_bot?start=app_hive. А браузер тут: https://t.me/example_farm_bot?start=app_browser!'
    )
  })

  it('keeps HTML and Markdown around the link intact', () => {
    expect(
      rewriteAppUrls('<a href="https://app.t27.ai/chat">agent</a>', BOT)
    ).toBe('<a href="https://t.me/example_farm_bot?start=app_chat">agent</a>')
    expect(rewriteAppUrls('[agent](https://app.t27.ai/chat)', BOT)).toBe(
      '[agent](https://t.me/example_farm_bot?start=app_chat)'
    )
  })

  it('leaves other hosts alone, including look-alikes', () => {
    const text =
      'https://t27.ai/#/queen https://app.t27.ai.evil.example/x https://vibee-render-production.up.railway.app/s3/a.mp4'
    expect(rewriteAppUrls(text, BOT)).toBe(text)
    expect(hasRawAppUrl(text)).toBe(false)
  })

  it('without a bot name changes nothing (a link to some other bot is worse)', () => {
    expect(rewriteAppUrls('https://app.t27.ai/hive', '')).toBe(
      'https://app.t27.ai/hive'
    )
  })

  it('counts: two URLs in, two links out, none left raw', () => {
    const out = rewriteAppUrls(
      'https://app.t27.ai/a https://app.t27.ai/hive',
      BOT
    )
    expect(out.match(/https:\/\/t\.me\//g)?.length).toBe(2)
    expect(hasRawAppUrl(out)).toBe(false)
  })
})

describe('the Main Mini App cache', () => {
  it('launch-time botInfo seeds it; a fresher getMe outranks it', async () => {
    rememberBotInfo({ username: BOT, has_main_web_app: false })
    expect(knownMainWebApp(BOT)).toBe(false)

    const getMe = vi
      .fn()
      .mockResolvedValue({ username: BOT, has_main_web_app: true })
    // Fresh cache: getMe is not asked.
    expect(await refreshMainWebApp({ getMe }, BOT)).toBe(false)
    expect(getMe).not.toHaveBeenCalled()

    // Stale: asked, and remembered.
    const later = Date.now() + MAIN_WEB_APP_TTL_MS + 1
    expect(await refreshMainWebApp({ getMe }, BOT, later)).toBe(true)
    expect(getMe).toHaveBeenCalledTimes(1)
    expect(knownMainWebApp(BOT)).toBe(true)
    rememberBotInfo({ username: BOT, has_main_web_app: false })
    expect(knownMainWebApp(BOT)).toBe(true)
  })

  it('a failing getMe never throws and never flips the answer to one tap', async () => {
    const getMe = vi.fn().mockRejectedValue(new Error('down'))
    expect(await refreshMainWebApp({ getMe }, BOT)).toBe(false)
    expect(knownMainWebApp(BOT)).toBe(false)
  })
})

describe('appButton -- the door as the surface allows', () => {
  it('private chat: a web_app button to the screen', () => {
    const b = appButton('Open', 'hive', {
      chatType: 'private',
      botUsername: BOT,
    })
    expect(b).toMatchObject({
      web_app: { url: expect.stringContaining('tgWebAppStartParam=hive') },
    })
    expect(b).not.toHaveProperty('url')
  })

  it('group, channel and business: a url button to the t.me link', () => {
    for (const where of [
      { chatType: 'group' },
      { chatType: 'supergroup' },
      { chatType: 'channel' },
      { chatType: 'private', business: true },
    ]) {
      const b = appButton('Open', 'hive', { ...where, botUsername: BOT })
      expect(b, JSON.stringify(where)).toEqual({
        text: 'Open',
        url: 'https://t.me/example_farm_bot?start=app_hive',
        hide: false,
      })
    }
  })

  it('no bot name outside a private chat: no button, never a raw app URL', () => {
    expect(appButton('Open', 'hive', { chatType: 'group' })).toBeNull()
  })
})

describe('sendAppDoor -- the answer to /start app_<route>', () => {
  it('ONE message with ONE web_app button to that screen', async () => {
    const reply = vi.fn().mockResolvedValue(undefined)
    await sendAppDoor(
      { reply, chat: { type: 'private' }, botInfo: { username: BOT } },
      'browser',
      true
    )
    expect(reply).toHaveBeenCalledTimes(1)
    const [text, extra] = reply.mock.calls[0]
    expect(text).toMatch(/Telegram/)
    const rows = extra.reply_markup.inline_keyboard
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveLength(1)
    expect(rows[0][0].web_app.url).toMatch(/tgWebAppStartParam=browser$/)
  })
})

describe('buttonsForAnswer -- the agent’s answer in the bot chat', () => {
  it('rewrites raw app URLs into this bot’s link, and keeps the buttons', async () => {
    const { buttonsForAnswer } = await import(
      '@/navigation/helpers/actionButtons'
    )
    const { text, markup } = buttonsForAnswer(
      'Ваш улей: https://app.t27.ai/hive [[Мой баланс|act:balance]]',
      true,
      { app: true, bot: { username: BOT, has_main_web_app: false } }
    )
    expect(text).toBe('Ваш улей: https://t.me/example_farm_bot?start=app_hive')
    expect(JSON.stringify(markup)).toContain('act:balance')
  })

  it('without the bot it cannot know whose link to write, and changes nothing', async () => {
    const { buttonsForAnswer } = await import(
      '@/navigation/helpers/actionButtons'
    )
    const { text } = buttonsForAnswer('https://app.t27.ai/hive', true, {})
    expect(text).toBe('https://app.t27.ai/hive')
  })

  it('a bot WITH a Main Mini App gets the one-tap link', async () => {
    const { buttonsForAnswer } = await import(
      '@/navigation/helpers/actionButtons'
    )
    const { text } = buttonsForAnswer('https://app.t27.ai/chat', false, {
      bot: { username: BOT, has_main_web_app: true },
    })
    expect(text).toBe('https://t.me/example_farm_bot?startapp=chat')
  })
})

describe('/browser in a group -- a door that opens inside Telegram', () => {
  it('a url button to the bot’s t.me link, never to the app host', async () => {
    const { browserInviteKeyboard } = await import(
      '@/navigation/helpers/browserInvite'
    )
    const rows = browserInviteKeyboard(false, {
      app: false,
      botUsername: BOT,
    }) as any[][]
    expect(rows).toHaveLength(1)
    expect(rows[0][0].url).toBe(
      'https://t.me/example_farm_bot?start=app_browser'
    )
    expect(rows[0][0].web_app).toBeUndefined()
  })
})

describe('a bare host is a link too -- Telegram auto-links it', () => {
  it('rewrites app.t27.ai/feed without a scheme, not an e-mail or a path', () => {
    expect(rewriteAppUrls('Лента: app.t27.ai/feed', BOT)).toBe(
      'Лента: https://t.me/example_farm_bot?start=app_feed'
    )
    const untouched = 'me@app.t27.ai https://example.com/app.t27.ai/x'
    expect(rewriteAppUrls(untouched, BOT)).toBe(untouched)
  })
})
