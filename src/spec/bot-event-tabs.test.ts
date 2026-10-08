/**
 * Spec bot-event-tabs.t27 (gHashTag/t27#7836), every test block run against
 * the bot's code in navigation/topics/eventTabs.ts, then the behaviour: a
 * payment handler's sends land in the Treasurer's tab, and only there. The
 * render's half (browser requests, story reels) is bound in
 * apps/vibee-editor/render/src/spec/bot-event-tabs.test.ts.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as SPEC from './bot-event-tabs.gen'
import { TAB_KEYS } from './bot-topic-tabs.gen'

const knownTabs = vi.fn()
vi.mock('@/navigation/topics/tabs', () => ({
  knownTabs: (...a: unknown[]) => knownTabs(...a),
}))

import {
  eventPayload,
  inEventTab,
  routesToTab,
  tabOfEvent,
} from '@/navigation/topics/eventTabs'

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
    expect(SPEC.EVENT_TABS).toHaveLength(SPEC.EVENT_COUNT)
    // every tab named is a tab the bot makes (bot-topic-tabs.t27 TAB_KEYS)
    for (const tab of SPEC.EVENT_TABS)
      expect((TAB_KEYS as readonly string[]).includes(tab)).toBe(true)
    expect(tabOfEvent('reel')).toBe('reels')
    expect(tabOfEvent('payment')).toBe('wallet')
    expect(tabOfEvent('browser')).toBe('browser')
  })

  it("VERSION says what the header's last note says", () => {
    expect(SPEC.VERSION).toBe(1)
  })
})

describe("a send in the event's tab", () => {
  it('a send that named no thread -- Telegraf writes undefined -- gets the tab', () => {
    expect(
      eventPayload(
        'sendMessage',
        { chat_id: 7, message_thread_id: undefined },
        7,
        42
      ).message_thread_id
    ).toBe(42)
    expect(
      eventPayload('sendMessage', { chat_id: 7 }, 7, 42).message_thread_id
    ).toBe(42)
  })

  it('a named thread, null included, is kept', () => {
    expect(
      eventPayload('sendMessage', { chat_id: 7, message_thread_id: 9 }, 7, 42)
        .message_thread_id
    ).toBe(9)
    expect(
      eventPayload(
        'sendMessage',
        { chat_id: 7, message_thread_id: null },
        7,
        42
      ).message_thread_id
    ).toBeNull()
  })

  it('another chat, a business send or an unthreaded method is untouched', () => {
    expect(
      eventPayload('sendMessage', { chat_id: 8 }, 7, 42).message_thread_id
    ).toBeUndefined()
    expect(
      eventPayload(
        'sendMessage',
        { chat_id: 7, business_connection_id: 'b' },
        7,
        42
      ).message_thread_id
    ).toBeUndefined()
    expect(
      eventPayload('answerCallbackQuery', { chat_id: 7 }, 7, 42)
        .message_thread_id
    ).toBeUndefined()
  })
})

describe('a payment lands in the Treasurer tab', () => {
  afterEach(() => knownTabs.mockReset())

  const run = async (type = 'private') => {
    const sent: any[] = []
    const base = {
      callApi: vi.fn(async (method: string, payload: any) => {
        sent.push({ method, payload })
        return true
      }),
    }
    const handler = vi.fn(async (ctx: any) => {
      // What Telegraf's ctx.reply sends for a message outside any topic.
      await ctx.telegram.callApi('sendMessage', {
        chat_id: 777,
        text: 'Thank you!',
        message_thread_id: undefined,
      })
    })
    await inEventTab(
      'payment',
      handler
    )({
      chat: { id: 777, type },
      botInfo: { username: 'test_bot' },
      telegram: base,
    })
    return { sent, handler }
  }

  it('with a Treasurer tab, every send of the handler goes there', async () => {
    knownTabs.mockResolvedValue([
      { thread_id: 11, kind: 'agent', title: null },
      { thread_id: 15, kind: 'wallet', title: null },
    ])
    const { sent } = await run()
    expect(knownTabs).toHaveBeenCalledWith('test_bot', 777)
    expect(sent[0].payload.message_thread_id).toBe(15)
  })

  it('without the tab, the general view as before', async () => {
    knownTabs.mockResolvedValue([{ thread_id: 11, kind: 'agent', title: null }])
    const { sent, handler } = await run()
    expect(handler).toHaveBeenCalled()
    expect(sent[0].payload.message_thread_id).toBeUndefined()
  })

  it('a claim still being made (negative thread) is no tab', async () => {
    knownTabs.mockResolvedValue([
      { thread_id: -1, kind: 'wallet', title: null },
    ])
    const { sent } = await run()
    expect(sent[0].payload.message_thread_id).toBeUndefined()
  })

  it('a lookup that fails runs the handler as before', async () => {
    knownTabs.mockRejectedValue(new Error('db down'))
    const { sent, handler } = await run()
    expect(handler).toHaveBeenCalled()
    expect(sent[0].payload.message_thread_id).toBeUndefined()
  })

  it('outside a private chat nothing is looked up', async () => {
    const { handler } = await run('supergroup')
    expect(handler).toHaveBeenCalled()
    expect(knownTabs).not.toHaveBeenCalled()
  })
})
