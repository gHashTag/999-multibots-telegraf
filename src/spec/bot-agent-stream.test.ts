/**
 * Spec bot-agent-stream.t27 (gHashTag/t27#7836), every test block run against
 * the bot's code in navigation/helpers/answerDraft.ts, then the behaviour the
 * rules drive: "Thinking…" with a stop button, a draft that grows at the
 * spec's pace, a stop that ends the turn, the probe that falls back to
 * typing, ephemeral one-person replies, and the relay's text callback. That
 * every door of the agent lane uses them is pinned in
 * src/__tests__/bot/answerDraftIsWired.test.ts.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as SPEC from './bot-agent-stream.gen'
import {
  afterStop,
  draftChars,
  draftDue,
  draftStopMiddleware,
  ephemeral,
  replyToOne,
  resetAnswerDrafts,
  startAnswerDraft,
  stopAnswerDraft,
  usesDraft,
} from '@/navigation/helpers/answerDraft'

describe('spec bot-agent-stream.t27', () => {
  it('drafts only in a private chat whose server takes them', () => {
    expect(usesDraft(true, 0)).toBe(true)
    expect(usesDraft(true, 1)).toBe(false)
    expect(usesDraft(false, 0)).toBe(false)
    expect(usesDraft(false, 1)).toBe(false)
  })

  it('a draft follows the answer at most once a second and stays alive', () => {
    expect(draftDue(true, 0)).toBe(false)
    expect(draftDue(true, 999)).toBe(false)
    expect(draftDue(true, 1000)).toBe(true)
    expect(draftDue(false, 5000)).toBe(false)
    expect(draftDue(false, 19999)).toBe(false)
    expect(draftDue(false, 20000)).toBe(true)
  })

  it('the draft never exceeds what Telegram takes', () => {
    expect(draftChars(0)).toBe(0)
    expect(draftChars(4096)).toBe(4096)
    expect(draftChars(4097)).toBe(4096)
    expect(draftChars(9000)).toBe(4096)
  })

  it('a stop keeps what was written, or says it stopped', () => {
    expect(afterStop(1)).toBe(1)
    expect(afterStop(300)).toBe(1)
    expect(afterStop(0)).toBe(2)
  })

  it('the answer always persists as a real message', () => {
    expect(SPEC.ANSWER_PERSISTS).toBe(true)
    expect(SPEC.EPHEMERAL_FALLS_BACK).toBe(true)
  })

  it('only a group reply for one person is ephemeral', () => {
    expect(ephemeral(true, true)).toBe(true)
    expect(ephemeral(true, false)).toBe(false)
    expect(ephemeral(false, true)).toBe(false)
    expect(ephemeral(false, false)).toBe(false)
  })

  it("VERSION says what the header's last note says", () => {
    expect(SPEC.VERSION).toBe(1)
  })
})

/** A chat with a clock the test moves, and every Bot API call recorded. */
function chat(type = 'private', refuse = false, bot = 'test_bot') {
  let now = 1_000_000
  const calls: { method: string; payload: any }[] = []
  const ctx = {
    chat: { id: 777, type },
    botInfo: { username: bot },
    telegram: {
      callApi: vi.fn(async (method: string, payload: any) => {
        calls.push({ method, payload })
        if (refuse) throw new Error('404: Not Found: method not found')
        return true
      }),
    },
  }
  const clock = () => now
  const tick = (ms: number) => {
    now += ms
  }
  const drafts = () => calls.filter(c => c.method === 'sendMessageDraft')
  return { ctx, clock, tick, calls, drafts }
}
const settle = () => new Promise(r => setTimeout(r, 0))

afterEach(() => {
  resetAnswerDrafts()
  vi.useRealTimers()
})

describe('an answer that grows on screen', () => {
  it('opens with "Thinking…" and a stop button', async () => {
    const c = chat()
    startAnswerDraft(c.ctx, c.clock)
    await settle()
    expect(c.drafts()).toHaveLength(1)
    expect(c.drafts()[0].payload).toMatchObject({
      chat_id: 777,
      text: '',
      can_stop: true,
    })
    expect(c.drafts()[0].payload.draft_id).toBeGreaterThan(0)
  })

  it('follows the answer at the spec pace, never twice inside a second', async () => {
    const c = chat()
    const d = startAnswerDraft(c.ctx, c.clock)
    await settle()
    c.tick(SPEC.DRAFT_EVERY_MS - 1)
    d.grow('Hel')
    await settle()
    expect(c.drafts()).toHaveLength(1)
    c.tick(1)
    d.grow('Hello')
    await settle()
    expect(c.drafts().map(x => x.payload.text)).toEqual(['', 'Hello'])
    // Same draft id: Telegram animates the change.
    expect(c.drafts()[1].payload.draft_id).toBe(c.drafts()[0].payload.draft_id)
  })

  it('cuts a long answer to what Telegram takes, in whole characters', async () => {
    const c = chat()
    const d = startAnswerDraft(c.ctx, c.clock)
    await settle()
    c.tick(SPEC.DRAFT_EVERY_MS)
    d.grow('🎬'.repeat(SPEC.DRAFT_MAX_CHARS + 10))
    await settle()
    expect([...c.drafts()[1].payload.text]).toHaveLength(SPEC.DRAFT_MAX_CHARS)
  })

  it('keeps "Thinking…" alive while a tool runs and no text arrives', async () => {
    vi.useFakeTimers()
    const c = chat()
    startAnswerDraft(c.ctx, c.clock)
    await vi.advanceTimersByTimeAsync(0)
    c.tick(SPEC.DRAFT_REFRESH_MS)
    await vi.advanceTimersByTimeAsync(SPEC.DRAFT_REFRESH_MS)
    expect(c.drafts().length).toBeGreaterThanOrEqual(2)
  })

  it('sends nothing after the turn closed', async () => {
    const c = chat()
    const d = startAnswerDraft(c.ctx, c.clock)
    await settle()
    d.close()
    c.tick(SPEC.DRAFT_REFRESH_MS)
    d.grow('late')
    await settle()
    expect(c.drafts()).toHaveLength(1)
  })

  it('is inert in a group: no draft, no signal', async () => {
    const c = chat('supergroup')
    const d = startAnswerDraft(c.ctx, c.clock)
    d.grow('text')
    await settle()
    expect(c.calls).toHaveLength(0)
    expect(d.signal).toBeUndefined()
  })

  it('one refusal turns drafts off for that bot, and only that bot', async () => {
    const refused = chat('private', true, 'old_server_bot')
    startAnswerDraft(refused.ctx, refused.clock)
    await settle()
    const again = chat('private', false, 'old_server_bot')
    const d = startAnswerDraft(again.ctx, again.clock)
    expect(d.signal).toBeUndefined()
    expect(again.calls).toHaveLength(0)
    const other = chat('private', false, 'new_server_bot')
    startAnswerDraft(other.ctx, other.clock)
    await settle()
    expect(other.drafts()).toHaveLength(1)
  })
})

describe('the stop button', () => {
  it('a stop press aborts its own turn and no other', async () => {
    const c = chat()
    const d1 = startAnswerDraft(c.ctx, c.clock)
    const d2 = startAnswerDraft(c.ctx, c.clock)
    await settle()
    // The second turn's press: the first must keep running.
    const id2 = c.drafts()[1].payload.draft_id
    const next = vi.fn()
    await draftStopMiddleware(
      {
        update: {
          stopped_message_generation: { chat: { id: 777 }, draft_id: id2 },
        },
      },
      next
    )
    expect(next).not.toHaveBeenCalled()
    expect(d2.stopped).toBe(true)
    expect(d2.signal?.aborted).toBe(true)
    expect(d1.stopped).toBe(false)
    expect(d1.signal?.aborted).toBe(false)
  })

  it('a press for a turn that already ended changes nothing', () => {
    expect(stopAnswerDraft(777, 12345)).toBe(false)
  })

  it('every other update passes through', async () => {
    const next = vi.fn(async () => undefined)
    await draftStopMiddleware({ update: { message: { text: 'hi' } } }, next)
    expect(next).toHaveBeenCalled()
  })

  it('keeps the words written so far', async () => {
    const c = chat()
    const d = startAnswerDraft(c.ctx, c.clock)
    d.grow('Half an answer')
    expect(d.text).toBe('Half an answer')
  })
})

describe('a reply for one person in a group', () => {
  const ctxOf = (type: string, refuse = false) => {
    const reply = vi.fn(async (_t: string, extra: any) => {
      if (refuse && extra?.ephemeral_message_parameters)
        throw new Error('400: Bad Request: unknown parameter')
      return { message_id: 1 }
    })
    return { ctx: { chat: { id: -100, type }, from: { id: 5 }, reply }, reply }
  }

  it('is ephemeral to the person who asked', async () => {
    const { ctx, reply } = ctxOf('supergroup')
    await replyToOne(ctx, 'only you')
    expect(reply).toHaveBeenCalledWith('only you', {
      ephemeral_message_parameters: { receiver_user_id: 5 },
    })
  })

  it('falls back to an ordinary reply when the server refuses it', async () => {
    const { ctx, reply } = ctxOf('supergroup', true)
    await replyToOne(ctx, 'only you')
    expect(reply).toHaveBeenCalledTimes(2)
    expect(reply.mock.calls[1]).toEqual(['only you', {}])
  })

  it('in a private chat is an ordinary reply', async () => {
    const { ctx, reply } = ctxOf('private')
    await replyToOne(ctx, 'hi')
    expect(reply).toHaveBeenCalledWith('hi', {})
  })
})

describe('the relay hands the answer over as it is written', () => {
  it('onText sees the text so far after every text event', async () => {
    process.env.RENDER_API_KEY = 'k-for-tests' // secret-guard-ok: invented for this test
    const events = [
      { тип: 'текст', текст: 'Hello' }, // cyrillic-ok: the render's event names
      { тип: 'текст', текст: ', world' }, // cyrillic-ok: the render's event names
      { тип: 'готово' }, // cyrillic-ok: the render's event names
    ]
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        String(url).includes('/api/agent/history')
          ? new Response(JSON.stringify({ messages: [] }), { status: 200 })
          : new Response(events.map(e => JSON.stringify(e)).join('\n') + '\n', {
              status: 200,
            })
      )
    )
    const seen: string[] = []
    const { спроситьАгента } = await import('@/services/trinityAgent') // cyrillic-ok: pre-existing export
    await спроситьАгента('555', 'hi', { onText: t => seen.push(t) }) // cyrillic-ok: pre-existing export
    expect(seen).toEqual(['Hello', 'Hello, world'])
    vi.unstubAllGlobals()
  })
})
