/**
 * WHAT GOES ON RECORD, AND HOW MANY TIMES.
 *
 * Read out of a live client's transcript, telegram 2086031075, 20.09.2026:
 *
 *   1716 17:05:19 user       (her question)
 *   1717 17:05:35 assistant  (the answer)
 *   1718 17:05:35 user       (her question, again, same text)
 *   1719 17:05:35 assistant  (the answer, again, same text)
 *
 * She asked once. The render records the question on its way into the turn and
 * the answer on its way out, and this path recorded the same pair again, so
 * every answered exchange cost the 40-turn window two turns instead of one --
 * the agent remembered half as far back as anyone believed.
 *
 * The other half of the same defect is invisible in that excerpt, because what
 * is missing leaves no row: when the render missed its ceiling and the
 * tool-less fallback answered her, NOTHING was written at all. The next turn
 * was handed a transcript in which she had asked and been ignored, which is
 * the shape that makes an agent start over and say hello to somebody it has
 * been talking to all afternoon.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// The module graph behind businessBotService reaches the scene registry, which
// builds its keyboards from the model list at import time.
vi.mock('@/services/aiChatService', () => ({
  chatWithAI: vi.fn(async () => 'unused'),
  AI_CHAT_MODELS: {},
}))
vi.mock('@/core/supabase', () => ({
  getUserLanguageFromDB: vi.fn(async () => null),
}))

const recorded: Array<{
  chatId: string
  turns: Array<{ role: string; content: string }>
}> = []

let agentAnswer: (() => Promise<{ текст?: string }>) | null = null // cyrillic-ok: reply field

vi.mock('@/services/trinityAgent', () => ({
  /* cyrillic-ok */ спроситьАгента: async () => {
    // cyrillic-ok: pre-existing identifier
    if (!agentAnswer) throw new Error('RENDER_API_KEY не задан')
    return agentAnswer()
  },
  recordTurns: async (
    chatId: string,
    turns: Array<{ role: string; content: string }>
  ) => {
    recorded.push({ chatId, turns })
    return 'recorded'
  },
  fetchHistory: async () => [],
  markSurface: (content: string) => content,
}))

import { answerClient } from '@/services/businessBotService'

const CLIENT = '2086031075'

beforeEach(() => {
  recorded.length = 0
  agentAnswer = null
})

describe('an exchange the agent answered', () => {
  it('is written by the render, and not a second time here', async () => {
    agentAnswer = async () => ({ ['текст']: 'Вот план на месяц.' }) // cyrillic-ok: reply field

    const said = await answerClient(CLIENT, 'Как это сделать?', async () => {
      throw new Error('the fallback must not be reached')
    })

    expect(said).toBe('Вот план на месяц.')
    expect(recorded).toEqual([])
  })
})

describe('an exchange the fallback answered', () => {
  it('goes on record, so the next turn knows it happened', async () => {
    const said = await answerClient(
      CLIENT,
      'Давай',
      async () => 'Запускаю, Лена.'
    )

    expect(said).toBe('Запускаю, Лена.')
    expect(recorded).toHaveLength(1)
    expect(recorded[0].chatId).toBe(CLIENT)
    expect(recorded[0].turns).toEqual([
      { role: 'user', content: 'Давай' },
      { role: 'assistant', content: 'Запускаю, Лена.' },
    ])
  })

  it('records nothing when the fallback had nothing to say', async () => {
    // An empty answer is not sent to anybody, so putting it in the transcript
    // would invent a reply the client never received.
    const said = await answerClient(CLIENT, 'Давай', async () => '')
    expect(said).toBe('')
    expect(recorded).toEqual([])
  })
})
