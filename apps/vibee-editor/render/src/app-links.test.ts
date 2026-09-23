/**
 * The render's copy of "links to the app open inside Telegram" (app-links.ts).
 *
 * The render knows a bot by its token, so these drive getMe through a fake
 * fetch: no network, and the host asked is checked to be the one
 * telegramApiFor picks for that token. Bot names are invented.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  appLinkFor,
  appLinkForToken,
  botOfToken,
  forgetBotsOfTokensForTests,
  hasRawAppUrl,
  isAppFileUrl,
  rewriteAppUrls,
  rewriteAppUrlsForToken,
  BOT_OF_TOKEN_TTL_MS,
} from './app-links'
import { telegramApiFor } from './telegram-api'

const TOKEN = '900000071:fake-secret'

function getMe(result: Record<string, unknown> | null) {
  return vi.fn(async (_url: string) => ({
    json: async () => (result ? { ok: true, result } : { ok: false }),
  })) as unknown as typeof fetch & ReturnType<typeof vi.fn>
}

beforeEach(() => forgetBotsOfTokensForTests())

describe('appLinkFor (render mirror)', () => {
  it('two-tap without a Main Mini App, one tap with it', () => {
    expect(appLinkFor('example_farm_bot', 'hive')).toBe(
      'https://t.me/example_farm_bot?start=app_hive'
    )
    expect(appLinkFor('example_farm_bot', 'hive', { mainWebApp: true })).toBe(
      'https://t.me/example_farm_bot?startapp=hive'
    )
    expect(appLinkFor('', 'hive')).toBe('')
  })
})

describe('botOfToken -- getMe on the bot’s own host, remembered', () => {
  it('asks telegramApiFor(token)/getMe once, then remembers', async () => {
    const f = getMe({ username: 'example_farm_bot', has_main_web_app: false })
    expect(await botOfToken(TOKEN, f)).toEqual({
      username: 'example_farm_bot',
      mainWebApp: false,
    })
    await botOfToken(TOKEN, f)
    expect(f).toHaveBeenCalledTimes(1)
    expect(String((f as any).mock.calls[0][0])).toBe(
      `${telegramApiFor(TOKEN)}/getMe`
    )
  })

  /*
   * A bot moved to our own Bot API server must never be asked on the cloud:
   * that request logs it back in there (src/telegram-api.ts). With the bot
   * listed as local, getMe goes to OUR host.
   */
  it('a bot on our own Bot API server is asked there, not on the cloud', async () => {
    vi.stubEnv('TELEGRAM_API_ROOT', 'http://bot-api.internal.test:8081')
    vi.stubEnv('BOT_API_LOCAL_BOTS', '900000071')
    vi.stubEnv('TELEGRAM_API_FILES_ROOT', 'http://bot-api.internal.test:8082')
    try {
      const f = getMe({ username: 'example_farm_bot' })
      await botOfToken(TOKEN, f)
      const asked = String((f as any).mock.calls[0][0])
      expect(asked.startsWith('http://bot-api.internal.test:8081/')).toBe(true)
      expect(asked).not.toContain('api.telegram.org')
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('asks again once the answer is stale -- BotFather may have changed', async () => {
    const f = getMe({ username: 'example_farm_bot', has_main_web_app: true })
    await botOfToken(TOKEN, f, 0)
    await botOfToken(TOKEN, f, BOT_OF_TOKEN_TTL_MS + 1)
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('a bot that does not answer is null, and not remembered', async () => {
    expect(await botOfToken(TOKEN, getMe(null))).toBeNull()
    const f = getMe({ username: 'example_farm_bot' })
    expect(await botOfToken(TOKEN, f)).not.toBeNull()
  })
})

describe('rewriteAppUrlsForToken -- the safety net on render notices', () => {
  it('turns raw app URLs into this bot’s t.me link', async () => {
    const f = getMe({ username: 'example_farm_bot', has_main_web_app: false })
    const out = await rewriteAppUrlsForToken(
      'Готово: https://app.t27.ai/browser и vibee-editor-production.up.railway.app/hive',
      TOKEN,
      f
    )
    expect(out).toBe(
      'Готово: https://t.me/example_farm_bot?start=app_browser и https://t.me/example_farm_bot?start=app_hive'
    )
    expect(hasRawAppUrl(out)).toBe(false)
  })

  it('does not ask Telegram when there is nothing to fix', async () => {
    const f = getMe({ username: 'example_farm_bot' })
    expect(await rewriteAppUrlsForToken('https://t27.ai', TOKEN, f)).toBe(
      'https://t27.ai'
    )
    expect(f).not.toHaveBeenCalled()
  })

  it('an unknown bot leaves the text as it was rather than guess one', async () => {
    const text = 'https://app.t27.ai/hive'
    expect(await rewriteAppUrlsForToken(text, TOKEN, getMe(null))).toBe(text)
    expect(await rewriteAppUrlsForToken(text, '', getMe(null))).toBe(text)
  })

  it('appLinkForToken: one-tap for a bot with a Main Mini App', async () => {
    const f = getMe({ username: 'example_farm_bot', has_main_web_app: true })
    expect(await appLinkForToken(TOKEN, 'feed', f)).toBe(
      'https://t.me/example_farm_bot?startapp=feed'
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

  it('leaves look-alike hosts alone', () => {
    const t =
      'https://app.t27.ai.evil.example/x https://vibee-render-production.up.railway.app/s3/a'
    expect(rewriteAppUrls(t, 'example_farm_bot')).toBe(t)
  })
})

describe('screens no link may name (mirror of the bot)', () => {
  it('appLinkFor builds no link to pair, one tap or two', () => {
    expect(appLinkFor('example_farm_bot', 'pair')).toBe('')
    expect(appLinkFor('example_farm_bot', 'pair', { mainWebApp: true })).toBe(
      ''
    )
  })

  it('a raw /pair URL becomes the chat with the bot, not the feed', () => {
    expect(rewriteAppUrls('Вход: app.t27.ai/pair', 'example_farm_bot')).toBe(
      'Вход: https://t.me/example_farm_bot'
    )
  })
})

describe('a file on the app host is not a screen (mirror of the bot)', () => {
  it('media, /live/ and /bridge are left exactly as they were', () => {
    for (const url of [
      'https://app.t27.ai/covers/poster.jpeg',
      'https://app.t27.ai/backgrounds/business/00.mp4',
      'https://app.t27.ai/live/900000042/js/app.js',
      'https://app.t27.ai/bridge',
      'https://app.t27.ai/manifest.json',
    ]) {
      expect(isAppFileUrl(url)).toBe(true)
      expect(rewriteAppUrls(`Готово: ${url}`, 'example_farm_bot')).toBe(
        `Готово: ${url}`
      )
      expect(hasRawAppUrl(url)).toBe(false)
    }
  })

  it('a screen on the same host is still rewritten', () => {
    expect(isAppFileUrl('https://app.t27.ai/hive')).toBe(false)
    expect(rewriteAppUrls('app.t27.ai/hive', 'example_farm_bot')).toBe(
      'https://t.me/example_farm_bot?start=app_hive'
    )
  })

  it('rewriteAppUrlsForToken never asks getMe for a file-only text', async () => {
    // hasRawAppUrl is the precheck: a caption that is only a cover URL must
    // cost no Telegram call at all.
    const fetchImpl = vi.fn()
    const text = 'Обложка: https://app.t27.ai/covers/poster.jpeg'
    expect(
      await rewriteAppUrlsForToken(text, '900000042:token', fetchImpl)
    ).toBe(text)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
