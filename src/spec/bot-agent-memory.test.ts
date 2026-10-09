/**
 * Spec bot-agent-memory.t27 (gHashTag/t27#7824), every test block run against
 * the bot's code -- joins_base and memory_moves in navigation/topics/memory.ts,
 * reads_again in services/trinityAgent.ts -- then the behaviour the rules
 * drive: which conversation a private-chat turn joins, the second history
 * read, and a recorded fallback line landing where its turn was asked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as SPEC from './bot-agent-memory.gen'
import { TAB_KEYS } from './bot-topic-tabs.gen'

const knownTabs = vi.fn()
vi.mock('@/navigation/topics/tabs', () => ({
  knownTabs: (...a: unknown[]) => knownTabs(...a),
}))

import {
  agentConversationIn,
  conversationOfTab,
  joinsBase,
  memoryMoves,
} from '@/navigation/topics/memory'
import {
  CONVERSATION_ID_RE,
  fetchHistory,
  readsAgain,
  recordTurns,
} from '@/services/trinityAgent'

describe('spec bot-agent-memory.t27', () => {
  it("the Agent tab and every thread that is no fixed tab share the mini-app's conversation", () => {
    expect(joinsBase(false, 0)).toBe(true)
    expect(joinsBase(false, 3)).toBe(true)
    expect(joinsBase(true, 0)).toBe(true)
    expect(joinsBase(true, 1)).toBe(false)
    expect(joinsBase(true, 5)).toBe(false)
    // index 0 of the tab table is the Agent tab
    expect(TAB_KEYS[SPEC.BASE_TAB_INDEX]).toBe('agent')
  })

  it("a tab's memory is keyed by its kind, not by its thread", () => {
    expect(memoryMoves(false, true)).toBe(false)
    expect(memoryMoves(false, false)).toBe(false)
    expect(memoryMoves(true, false)).toBe(true)
    expect(memoryMoves(true, true)).toBe(true)
  })

  it('a failed history read is tried once more, never more', () => {
    expect(readsAgain(1, false)).toBe(true)
    expect(readsAgain(2, false)).toBe(false)
    expect(readsAgain(1, true)).toBe(false)
    expect(readsAgain(0, true)).toBe(false)
  })

  it("VERSION says what the header's last note says", () => {
    expect(SPEC.VERSION).toBe(1)
  })
})

describe('which conversation a turn in the private chat joins', () => {
  const AGENT_THREAD = 11
  const REELS_THREAD = 12
  const tabs = [
    { thread_id: AGENT_THREAD, kind: 'agent', title: null },
    { thread_id: REELS_THREAD, kind: 'reels', title: null },
  ]
  const turnIn = (threadId: number | undefined, type = 'private') => ({
    state: threadId === undefined ? {} : { topicThreadId: threadId },
    chat: { id: 777, type },
    from: { id: 777 },
    botInfo: { username: 'test_bot' },
  })

  beforeEach(() => {
    knownTabs.mockReset()
    knownTabs.mockResolvedValue(tabs)
  })

  it('every fixed tab but the Agent tab has its own memory, a valid render id', () => {
    expect(conversationOfTab('agent')).toBeUndefined()
    expect(conversationOfTab(undefined)).toBeUndefined()
    expect(conversationOfTab('nonsense')).toBeUndefined()
    for (const kind of TAB_KEYS.slice(1)) {
      const id = conversationOfTab(kind)
      expect(id).toBe(`${SPEC.TAB_MEMORY_PREFIX}${kind}`)
      expect(CONVERSATION_ID_RE.test(id!)).toBe(true)
    }
  })

  it('outside any thread: the base conversation, with no lookup', async () => {
    expect(await agentConversationIn(turnIn(undefined))).toBeUndefined()
    expect(knownTabs).not.toHaveBeenCalled()
  })

  it('the Agent tab speaks in the base conversation the mini-app opens', async () => {
    expect(await agentConversationIn(turnIn(AGENT_THREAD))).toBeUndefined()
  })

  it('a thread the person opened joins the base -- it never starts over', async () => {
    // The reported bug: a message outside the tabs opens a new thread, and a
    // memory keyed by thread had nothing in it.
    expect(await agentConversationIn(turnIn(9001))).toBeUndefined()
    expect(await agentConversationIn(turnIn(9002))).toBeUndefined()
  })

  it('a fixed tab keeps its memory under its kind', async () => {
    expect(await agentConversationIn(turnIn(REELS_THREAD))).toBe('tabreels')
    expect(knownTabs).toHaveBeenCalledWith('test_bot', 777)
  })

  it('a tab deleted and made again under a new thread finds the same memory', async () => {
    knownTabs.mockResolvedValue([{ thread_id: 99, kind: 'reels', title: null }])
    expect(await agentConversationIn(turnIn(99))).toBe('tabreels')
  })

  it('a lookup that fails or has no database joins the base, never throws', async () => {
    knownTabs.mockRejectedValue(new Error('db down'))
    expect(await agentConversationIn(turnIn(REELS_THREAD))).toBeUndefined()
    knownTabs.mockResolvedValue(null)
    expect(await agentConversationIn(turnIn(REELS_THREAD))).toBeUndefined()
  })

  it('a group is not a private tab', async () => {
    expect(
      await agentConversationIn(turnIn(REELS_THREAD, 'supergroup'))
    ).toBeUndefined()
  })
})

describe('the history read and the recorded line', () => {
  const calls: Array<{ url: string; body?: any }> = []
  const stub = (answers: Array<'fail' | 'throw' | unknown[]>) => {
    calls.length = 0
    let i = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: any) => {
        calls.push({
          url: String(url),
          body: init?.body ? JSON.parse(String(init.body)) : undefined,
        })
        const a = answers[Math.min(i++, answers.length - 1)]
        if (a === 'throw') throw new Error('ECONNRESET')
        if (a === 'fail')
          return { ok: false, status: 502, json: async () => ({}) }
        return { ok: true, status: 200, json: async () => ({ messages: a }) }
      })
    )
  }
  beforeEach(() => {
    process.env.RENDER_API_KEY = 'k-for-tests' // secret-guard-ok: invented for this test
  })
  afterEach(() => vi.unstubAllGlobals())

  const past = [{ role: 'user', content: 'my name is Ann' }]

  it('a failed read is tried once more and the turn gets its past', async () => {
    stub(['fail', past])
    expect(await fetchHistory('555')).toEqual(past)
    expect(calls).toHaveLength(2)
    stub(['throw', past])
    expect(await fetchHistory('555')).toEqual(past)
    expect(calls).toHaveLength(2)
  })

  it('two failed reads stop there', async () => {
    stub(['fail', 'fail', past])
    expect(await fetchHistory('555')).toEqual([])
    expect(calls).toHaveLength(2)
  })

  it('an empty conversation is read once: empty is an answer, not a failure', async () => {
    stub([[]])
    expect(await fetchHistory('555')).toEqual([])
    expect(calls).toHaveLength(1)
  })

  it("a fallback line is recorded in the tab's or the room's conversation", async () => {
    const line = [{ role: 'assistant' as const, content: 'line' }]
    stub([[]])
    await recordTurns('555', line, 'bot', { conversation: 'tabreels' })
    expect(calls[0].body).toMatchObject({ conversation: 'tabreels' })
    stub([[]])
    // a room turn names the room; the room wins over a conversation
    await recordTurns('555', line, 'bot', {
      room: '-1001234567',
      conversation: 'tabreels',
    })
    expect(calls[0].body).toMatchObject({ room: '-1001234567' })
    expect(calls[0].body.conversation).toBeUndefined()
    stub([[]])
    await recordTurns('555', line)
    expect(calls[0].body.room).toBeUndefined()
    expect(calls[0].body.conversation).toBeUndefined()
    // a malformed id is dropped, not sent
    stub([[]])
    await recordTurns('555', line, 'bot', { conversation: 'Bad Id!' })
    expect(calls[0].body.conversation).toBeUndefined()
  })
})
