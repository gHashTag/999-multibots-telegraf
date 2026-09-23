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
  isAppFileUrl,
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
    expect(appRouteFromStartParam('app_club')).toBe('club')
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

  it('ends the URL at a closing mark, a dash or a word -- keeps them, and the route', () => {
    // Review of PR #2870: the URL body ran on through closing marks and read
    // the route from them -- "hive»" is no route, so the link opened the feed
    // and the closing mark (or a whole word) was gone.
    const L = 'https://t.me/example_farm_bot?start=app_hive'
    const cases: Array<[string, string]> = [
      ['«https://app.t27.ai/hive»', `«${L}»`],
      ['“https://app.t27.ai/hive”', `“${L}”`],
      ['**https://app.t27.ai/hive**', `**${L}**`],
      ['`https://app.t27.ai/hive`', `\`${L}\``],
      ['https://app.t27.ai/hive—там', `${L}—там`],
      ['app.t27.ai/hive, там', `${L}, там`],
      ['https://app.t27.ai/hive?x=1&y=2#top.', `${L}.`],
    ]
    for (const [input, output] of cases) {
      expect(rewriteAppUrls(input, 'example_farm_bot')).toBe(output)
    }
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

  it('a copy without the chat getter still reads the chat from the message', async () => {
    // CreateUserScene passes `{ ...ctx }`: Telegraf's `chat` getter is gone,
    // `message.chat` is there. Without the fallback a new person got a url
    // button back to ?start=app_hive -- a loop, not the screen.
    const reply = vi.fn().mockResolvedValue(undefined)
    await sendAppDoor(
      {
        reply,
        message: { chat: { type: 'private' } },
        botInfo: { username: BOT },
      },
      'hive',
      false
    )
    const button = reply.mock.calls[0][1].reply_markup.inline_keyboard[0][0]
    expect(button.web_app?.url).toMatch(/tgWebAppStartParam=hive$/)
    expect(button.url).toBeUndefined()
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

  /*
   * It used to leave the raw link alone when the caller named no bot, and
   * the person got a link into a browser where nobody is signed in (owner,
   * 2026-09-23: "forbid it at the level of the code"). Now the last bot that
   * answered anybody is used, and with no bot at all the link is removed
   * rather than sent dead (appLinks.ts insideTelegram).
   */
  it('without the bot it falls back to the last one, and never leaves a raw link', async () => {
    const { buttonsForAnswer } = await import(
      '@/navigation/helpers/actionButtons'
    )
    const { forgetLastKnownBotForTests, rememberBotInfo } = await import(
      '@/navigation/helpers/appLinks'
    )
    forgetLastKnownBotForTests()
    expect(buttonsForAnswer('https://app.t27.ai/hive', true, {}).text).toBe('')
    rememberBotInfo({ username: BOT, has_main_web_app: false })
    const { text } = buttonsForAnswer('https://app.t27.ai/hive', true, {})
    expect(text).toContain(`t.me/${BOT}`)
    expect(text).not.toContain('app.t27.ai')
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

/**
 * `t.me/<bot>?start=app_pair` was a string anybody could post that put a
 * person one press from a live sign-in code (issue #2878). The screen stays;
 * only the LINK to it goes, and only for the routes named in
 * UNLINKABLE_APP_ROUTES.
 */
describe('a screen that mints a credential is not a destination', () => {
  it('appLinkFor builds no link to pair, one tap or two', () => {
    expect(appLinkFor(BOT, 'pair')).toBe('')
    expect(appLinkFor(BOT, 'pair', { mainWebApp: true })).toBe('')
    // The other screens are untouched.
    expect(appLinkFor(BOT, 'hive')).toBe(
      'https://t.me/example_farm_bot?start=app_hive'
    )
  })

  it('/start refuses the app_pair payload and keeps every other route', () => {
    expect(appRouteFromStartParam('app_pair')).toBeNull()
    expect(appRouteFromStartParam('app_club')).toBe('club')
  })

  it('the honest door survives: a web_app button in the private chat', () => {
    const button = appButton('Sign in', 'pair', {
      chatType: 'private',
      botUsername: BOT,
    }) as any
    expect(button?.web_app?.url).toContain('tgWebAppStartParam=pair')
  })

  it('outside a private chat there is no pair door at all', () => {
    expect(
      appButton('Sign in', 'pair', { chatType: 'group', botUsername: BOT })
    ).toBeNull()
  })

  it('a raw /pair URL in model text becomes the chat, not the feed', () => {
    // Not the feed: sending somebody to a screen they did not ask for is a
    // second wrong answer. The chat is where /app and the greeting live.
    expect(rewriteAppUrls('Вход: https://app.t27.ai/pair', BOT)).toBe(
      'Вход: https://t.me/example_farm_bot'
    )
    expect(hasRawAppUrl(rewriteAppUrls('app.t27.ai/pair', BOT))).toBe(false)
  })
})

/**
 * The app host is also an nginx serving files: /covers/, /backgrounds/,
 * /lipsync/, the reel's own .mp4, the live browser stream at /live/, the
 * identity bridge at /bridge. Those work in any browser, and turning one into
 * `t.me/<bot>?start=app_feed` broke a link that worked (review of #2870).
 */
describe('a file on the app host is not a screen', () => {
  const FILES = [
    'https://app.t27.ai/covers/poster.jpeg',
    'https://app.t27.ai/backgrounds/business/00.mp4',
    'https://app.t27.ai/lipsync/lipsync.mp4',
    'https://app.t27.ai/audio/theme.mp3',
    'https://app.t27.ai/sounds/ping.wav',
    'https://app.t27.ai/icons/apple-touch-icon.png',
    'https://app.t27.ai/manifest.json',
    'https://app.t27.ai/t27-logo.svg',
    'https://app.t27.ai/live/900000042/js/app.js',
    'https://app.t27.ai/bridge',
    'https://app.t27.ai/bridge/consent.html',
    'https://vibee-editor-production.up.railway.app/covers/cover.jpeg',
  ]

  it.each(FILES)('%s is left exactly as it was', url => {
    expect(rewriteAppUrls(`Готово: ${url}`, BOT)).toBe(`Готово: ${url}`)
    expect(isAppFileUrl(url)).toBe(true)
  })

  it('a screen on the same host is still rewritten', () => {
    for (const url of [
      'https://app.t27.ai/hive',
      'https://app.t27.ai/feed?post=900000042',
      'https://app.t27.ai',
      'https://app.t27.ai/generate/video',
    ]) {
      expect(isAppFileUrl(url)).toBe(false)
      expect(rewriteAppUrls(url, BOT)).toContain('t.me/example_farm_bot')
    }
  })

  it('a file and a screen in one sentence: only the screen moves', () => {
    expect(
      rewriteAppUrls(
        'Обложка app.t27.ai/covers/poster.jpeg, лента app.t27.ai/feed',
        BOT
      )
    ).toBe(
      'Обложка app.t27.ai/covers/poster.jpeg, лента https://t.me/example_farm_bot?start=app_feed'
    )
  })

  it('hasRawAppUrl counts screens, not files', () => {
    expect(hasRawAppUrl('app.t27.ai/covers/poster.jpeg')).toBe(false)
    expect(hasRawAppUrl('app.t27.ai/hive')).toBe(true)
    // Punctuation after the file name is the sentence, not the name.
    expect(hasRawAppUrl('Смотри app.t27.ai/lipsync/lipsync.mp4.')).toBe(false)
  })
})
