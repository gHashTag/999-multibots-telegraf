import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

import {
  retryDelaysFor,
  retryUntilAnswered,
  withTimeout,
} from '@/core/bot/launchWhenItAnswers'
import {
  createBotApiWatch,
  probeBotApiServer,
  startBotApiServerMonitor,
} from '@/services/botApiServerMonitor'
import {
  assertBotApiListKnown,
  assertBotsStayOnCloud,
} from '@/services/telegramApi'

/**
 * WHEN OUR OWN BOT API SERVER, OR THE CLOUD, SAYS "NOT NOW".
 *
 * Three ways a bot used to fall silent with nobody told:
 *
 *   - checked once at boot and skipped for the life of the process -- a bot
 *     just moved back to the cloud (refused there for 10 minutes after its
 *     logOut), or a bot on our server while it restarts;
 *   - its server gone, and Telegraf retrying quietly forever;
 *   - a script on a laptop, missing BOT_API_LOCAL_BOTS, calling the cloud for
 *     a moved bot and logging it back in there.
 */
const MOVED = '900000011:ZZmovedmovedmovedmovedmovedmovedmoved'
const ALERTS = '900000022:ZZalertsalertsalertsalertsalertsalert'
const OURS = 'http://telegram-bot-api.railway.internal:8081'
const FILES = 'http://telegram-bot-api.railway.internal:8082'
const LISTED_ENV = {
  TELEGRAM_API_ROOT: OURS,
  TELEGRAM_API_FILES_ROOT: FILES,
  BOT_API_LOCAL_BOTS: 'Moved_test_bot=900000011',
}

describe('a bot that does not answer is asked again, not dropped', () => {
  const noWait = async () => {}

  it('a listed bot: asked at once, then until it answers -- with no end', async () => {
    const { delays, forever } = retryDelaysFor(true)
    expect(forever).toBe(true)
    let calls = 0
    const answered = await retryUntilAnswered({
      attempt: async () => ++calls === 40,
      delays,
      forever,
      immediately: true,
      sleep: noWait,
    })
    expect(answered).toBe(true)
    expect(calls).toBe(40)
  })

  it('a cloud bot: asked for longer than the 10 minutes after a logOut, then left', async () => {
    const { delays, forever } = retryDelaysFor(false)
    expect(forever).toBe(false)
    const total = delays.reduce((a, b) => a + b, 0)
    expect(total).toBeGreaterThan(10 * 60_000)
    const slept: number[] = []
    let calls = 0
    const answered = await retryUntilAnswered({
      attempt: async () => {
        calls++
        return false
      },
      delays,
      forever,
      sleep: async ms => {
        slept.push(ms)
      },
    })
    expect(answered).toBe(false)
    expect(calls).toBe(delays.length)
    expect(slept).toEqual(delays)
  })

  it('a listed bot is picked up within a minute of the move script listing it', () => {
    const { delays } = retryDelaysFor(true)
    expect(Math.max(...delays)).toBeLessThanOrEqual(60_000)
  })

  it('a check against a server that hangs gives up at the timeout', async () => {
    await expect(withTimeout(new Promise(() => {}), 20)).rejects.toThrow(
      'no answer'
    )
    await expect(withTimeout(Promise.resolve(7), 20)).resolves.toBe(7)
  })

  it('the bot service wires it: listed bots never inline, a failed check retried, not dropped', () => {
    const src = readFileSync(
      resolve(__dirname, '..', 'index.ts'),
      'utf8'
    ).replace(/\s+/g, ' ')
    expect(src).toContain(
      'if (botApiIsLocalFor(token)) { void launchWhenItAnswers(token, tokenName, true) continue }'
    )
    expect(src).toContain(
      'if (await validateBotToken(token, tokenName)) { await setUpAndLaunch(token, tokenName) } else { void launchWhenItAnswers(token, tokenName, false) }'
    )
    expect(src).toContain('timeoutMs: CHECK_TIMEOUT_MS')
    // The first check no longer tells the operator the token is dead.
    expect(src).not.toContain('КРИТИЧЕСКАЯ ОШИБКА: ${tokenLabel} невалидный')
  })
})

describe('when our server stops answering, the admin hears it', () => {
  function fakeFetch(api: number | 'down', files: number | 'down') {
    const sent: { url: string; body: string }[] = []
    const fn = vi.fn(async (url: string, init?: RequestInit) => {
      const u = new URL(url)
      if (u.pathname.endsWith('/sendMessage')) {
        sent.push({ url, body: String(init?.body) })
        return new Response('{"ok":true}', { status: 200 })
      }
      const which = u.port === '8081' ? api : files
      if (which === 'down') throw new TypeError('fetch failed')
      return new Response(which === 200 ? 'ok' : 'Bad Gateway', {
        status: which,
      })
    })
    return { fn: fn as unknown as typeof fetch, sent }
  }

  it('probes both halves: the proxy answering 502 means the server is down', async () => {
    const { fn } = fakeFetch(502, 200)
    expect(await probeBotApiServer(LISTED_ENV, fn)).toEqual({
      api: 'HTTP 502',
      files: null,
    })
    const down = fakeFetch('down', 'down')
    const r = await probeBotApiServer(LISTED_ENV, down.fn)
    expect(r.api).toBeTruthy()
    expect(r.files).toBeTruthy()
  })

  it('a 404 at `/` is an answering server; only 5xx and silence are not', async () => {
    const { fn } = fakeFetch(404, 200)
    expect(await probeBotApiServer(LISTED_ENV, fn)).toEqual({
      api: null,
      files: null,
    })
  })

  it('every failure is logged; the admin is told once going down and once coming back', () => {
    const watch = createBotApiWatch(['900000011'])
    const first = watch({ api: 'HTTP 502', files: null })
    expect(first.logs).toHaveLength(1)
    expect(first.alerts).toHaveLength(1)
    expect(first.alerts[0]).toContain('900000011')
    const again = watch({ api: 'HTTP 502', files: null })
    expect(again.logs).toHaveLength(1)
    expect(again.alerts).toEqual([])
    const back = watch({ api: null, files: null })
    expect(back.logs).toEqual([])
    expect(back.alerts).toEqual([expect.stringContaining('answers again')])
  })

  it('the alert travels through BOT_TOKEN_1, on the cloud -- not through the server that is down', async () => {
    const { fn, sent } = fakeFetch(502, 200)
    const stop = startBotApiServerMonitor({
      env: { ...LISTED_ENV, BOT_TOKEN_1: ALERTS, ADMIN_CHAT_ID: '144022504' },
      fetchImpl: fn,
      intervalMs: 3_600_000,
    })
    try {
      await vi.waitFor(() => expect(sent).toHaveLength(1))
      expect(new URL(sent[0].url).origin).toBe('https://api.telegram.org')
      expect(sent[0].body).toContain('does not answer')
    } finally {
      stop?.()
    }
  })

  it('nothing listed, nothing watched', () => {
    expect(startBotApiServerMonitor({ env: {} })).toBeNull()
  })
})

describe('the bots that must stay on the cloud', () => {
  it('BOT_TOKEN_1 carries the alerts: listing it stops the deploy', () => {
    expect(() =>
      assertBotsStayOnCloud(
        { BOT_TOKEN_1: 'the admin alerts' },
        { ...LISTED_ENV, BOT_TOKEN_1: MOVED }
      )
    ).toThrow('must stay on the cloud')
    expect(() =>
      assertBotsStayOnCloud(
        { BOT_TOKEN_1: 'the admin alerts' },
        { ...LISTED_ENV, BOT_TOKEN_1: ALERTS }
      )
    ).not.toThrow()
  })
})

describe('tooling outside the service fails closed', () => {
  it('no BOT_API_LOCAL_BOTS and not on Railway: refuses, instead of assuming every bot is on the cloud', () => {
    expect(() => assertBotApiListKnown({})).toThrow('railway run')
  })

  it('set (even empty), or run with a Railway service variables: known', () => {
    expect(() =>
      assertBotApiListKnown({ BOT_API_LOCAL_BOTS: '' })
    ).not.toThrow()
    expect(() =>
      assertBotApiListKnown({ RAILWAY_SERVICE_NAME: '999-multibots-telegraf' })
    ).not.toThrow()
    expect(assertBotApiListKnown(LISTED_ENV).local.has('900000011')).toBe(true)
  })
})
