/**
 * Spec bot-event-tabs.t27 (gHashTag/t27#7836), every test block run against
 * the render's code in topic-event-tabs.ts, then the behaviour: a browser
 * request (sendToTelegram with event 'browser') and a story reel's news
 * (notifyInBot with event 'reel') land in their agent's tab when the person
 * has one. The bot's half (payments) is bound in src/spec/bot-event-tabs.test.ts.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as SPEC from './bot-event-tabs.gen'
import {
  configureEventTabs,
  EVENT_TAB_SQL,
  eventThread,
  routesToTab,
  tabOfEvent,
} from '../topic-event-tabs'

describe('spec bot-event-tabs.t27', () => {
  it('an event lands in its tab only when the tab exists and no thread was named', () => {
    expect(routesToTab(true, false)).toBe(true)
    expect(routesToTab(false, false)).toBe(false)
    expect(routesToTab(true, true)).toBe(false)
    expect(routesToTab(false, true)).toBe(false)
  })

  it('three events, each with its tab', () => {
    expect(SPEC.EVENT_COUNT).toBe(3)
    expect(SPEC.EVENT_KEYS).toHaveLength(SPEC.EVENT_COUNT)
    expect(tabOfEvent('reel')).toBe('reels')
    expect(tabOfEvent('payment')).toBe('wallet')
    expect(tabOfEvent('browser')).toBe('browser')
  })

  it("VERSION says what the header's last note says", () => {
    expect(SPEC.VERSION).toBe(1)
  })
})

/**
 * A pool with two of person 555's tabs in test_bot: the Agent tab first, then
 * the given kind at thread 31. It filters only by the conditions the SQL
 * names, so a query that forgot one finds the wrong tab (the Agent's, 11).
 */
function poolWith(kind: string) {
  const rows = [
    { bot: 'test_bot', person: 555, kind: 'agent', thread_id: 11 },
    { bot: 'test_bot', person: 555, kind, thread_id: 31 },
  ]
  const query = vi.fn(async (sql: string, params: unknown[] = []) => ({
    rows: rows
      .filter(
        r =>
          (!/lower\(bot_username\) = lower\(\$1\)/.test(sql) ||
            r.bot === String(params[0]).toLowerCase()) &&
          (!/telegram_id = \$2/.test(sql) || r.person === params[1]) &&
          (!/kind = \$3/.test(sql) || r.kind === params[2]) &&
          (!/thread_id > 0/.test(sql) || r.thread_id > 0)
      )
      .map(r => ({ thread_id: r.thread_id })),
  }))
  return { query }
}

afterEach(() => {
  configureEventTabs(null)
  vi.unstubAllGlobals()
})

describe("the render finds the person's tab", () => {
  it('by bot (any case), person and the event’s tab kind', async () => {
    configureEventTabs(() => poolWith('browser'))
    expect(await eventThread('Test_Bot', '555', 'browser')).toBe(31)
    expect(await eventThread('test_bot', '555', 'reel')).toBeUndefined()
    expect(await eventThread('test_bot', '556', 'browser')).toBeUndefined()
  })

  it('unwired, without a bot, or with a failing database: no tab', async () => {
    expect(await eventThread('test_bot', '555', 'browser')).toBeUndefined()
    configureEventTabs(() => poolWith('browser'))
    expect(await eventThread(null, '555', 'browser')).toBeUndefined()
    configureEventTabs(() => ({
      query: async () => {
        throw new Error('relation "bot_topic_tabs" does not exist')
      },
    }))
    expect(await eventThread('test_bot', '555', 'browser')).toBeUndefined()
  })
})

/** fetch that answers getMe as test_bot and records every send. */
function telegram() {
  const sends: { method: string; body: any }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: any) => {
      const method = String(url).split('/').pop()!
      if (method === 'getMe')
        return new Response(
          JSON.stringify({ ok: true, result: { username: 'test_bot' } }),
          { status: 200 }
        )
      sends.push({
        method,
        body: init?.body ? JSON.parse(String(init.body)) : {},
      })
      return new Response(JSON.stringify({ ok: true, result: {} }), {
        status: 200,
      })
    })
  )
  return sends
}

describe('the senders route their events', () => {
  it('a browser request lands in the Navigator tab', async () => {
    process.env.TELEGRAM_BOT_TOKEN = '123:TEST' // secret-guard-ok: invented for this test
    configureEventTabs(() => poolWith('browser'))
    const sends = telegram()
    const { sendToTelegram } = await import('../auth/telegram-sender')
    await sendToTelegram('555', 'May I?', undefined, { event: 'browser' })
    expect(sends[0].body.message_thread_id).toBe(31)
    // Without an event, the general view, exactly as before.
    await sendToTelegram('555', 'Hello')
    expect(sends[1].body.message_thread_id).toBeUndefined()
  })

  it("a story reel's news lands in the Director tab", async () => {
    process.env.TELEGRAM_BOT_TOKEN = '123:TEST' // secret-guard-ok: invented for this test
    configureEventTabs(() => poolWith('reels'))
    const sends = telegram()
    const { notifyInBot } = await import('../agent/story-deps')
    await notifyInBot(null, '555', 'Your reel is ready', {}, fetch, 'reel')
    expect(sends[0].body.message_thread_id).toBe(31)
    await notifyInBot(null, '555', 'No event', {}, fetch)
    expect(sends[1].body.message_thread_id).toBeUndefined()
  })
})
